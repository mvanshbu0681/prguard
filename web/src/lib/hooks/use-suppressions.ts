// OWNER: t2a (wave 1).
//
// The suppression ledger (spec §6.6, §6.7): read it, write to it, revoke from
// it. Writes are append-only on the server; revoke sets revoked_at and never
// deletes (the UI says "revoke" everywhere, dashboard §2.8).
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { listSuppressionsQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { listSuppressions, revokeSuppression, suppressFinding } from "@/api/sdk.gen";
import type { ListSuppressionsData } from "@/api/types.gen";
import type { Finding, FindingList, ReviewResult, SuppressionCreated, SuppressionItem, SuppressionList, SuppressRequest } from "@/lib/api-types";
import type { SuppressionScope } from "@/lib/contracts";
import {
  OPERATION,
  byOperation,
  invalidateSuppressionAffected,
  operationOf,
  tempId,
  toastWriteFailure,
  toastWriteSuccess,
  unwrap,
  unwrapWrite,
  type WriteHookOptions,
} from "./internal";
import {
  applySuppressionToFinding,
  applySuppressionToList,
  applySuppressionToPages,
  applySuppressionToResult,
  patchFromCreated,
  patchFromRequest,
  type SuppressionPatch,
} from "./suppress-reducer";

export interface SuppressionFilters {
  /** `owner/name` */
  repository?: string | null;
  scope?: SuppressionScope | null;
  /** Default true (the API's default): active rows only. false = every row in scope, whatever its state (the backend filters only when true). */
  active?: boolean | null;
  fingerprint?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

type SuppressionsQuery = NonNullable<ListSuppressionsData["query"]>;

export function suppressionsQuery(filters: SuppressionFilters = {}): SuppressionsQuery | undefined {
  const q: Record<string, unknown> = {};
  for (const key of ["repository", "scope", "fingerprint", "cursor"] as const) {
    const v = filters[key];
    if (typeof v === "string" && v !== "") q[key] = v;
  }
  if (typeof filters.active === "boolean") q.active = filters.active;
  if (typeof filters.limit === "number") q.limit = filters.limit;
  return Object.keys(q).length ? (q as SuppressionsQuery) : undefined;
}

/** GET /v1/suppressions — the ledger. `totals` counts active, expired and revoked rows in scope. */
export function useSuppressions(filters: SuppressionFilters = {}, options: { enabled?: boolean } = {}): UseQueryResult<SuppressionList, ApiError> {
  const query = suppressionsQuery(filters);
  return useQuery<SuppressionList, ApiError, SuppressionList, ReturnType<typeof listSuppressionsQueryKey>>({
    queryKey: listSuppressionsQueryKey({ query }),
    queryFn: ({ signal }) => unwrap(listSuppressions({ query, signal, throwOnError: true }), { method: "GET", path: "/v1/suppressions" }),
    enabled: options.enabled ?? true,
  });
}

// ---------------------------------------------------------------------------
// Suppress — optimistic, through the one shared reducer.
// ---------------------------------------------------------------------------

export interface SuppressVariables {
  findingId: string;
  request: SuppressRequest;
  /** Sent as X-Actor-Id; recorded as created_by and as the audit event's actor. */
  actorId?: string | null;
}

interface SuppressContext {
  snapshot: [QueryKey, unknown][];
}

const FINDING_HOLDERS = byOperation(OPERATION.listFindings, OPERATION.getFinding, OPERATION.getReviewResult);

/** Apply a patch to every cached query that holds the finding. */
function patchCaches(queryClient: QueryClient, findingId: string, patch: SuppressionPatch): void {
  for (const query of queryClient.getQueryCache().findAll({ predicate: FINDING_HOLDERS })) {
    const data = query.state.data;
    if (data === undefined) continue;
    const op = operationOf(query.queryKey);
    let next: unknown = data;
    if (op === OPERATION.getFinding) next = applySuppressionToFinding(data as Finding, findingId, patch);
    else if (op === OPERATION.getReviewResult) next = applySuppressionToResult(data as ReviewResult, findingId, patch);
    else if (op === OPERATION.listFindings) {
      next = "pages" in (data as object) ? applySuppressionToPages(data as InfiniteData<FindingList>, findingId, patch) : applySuppressionToList(data as FindingList, findingId, patch);
    }
    if (next !== data) queryClient.setQueryData(query.queryKey, next);
  }
}

/**
 * POST /v1/findings/{id}/suppress, optimistically. The finding flips to
 * `suppressed` (and stops blocking) in every cached list, detail and result
 * before the request leaves — a result's counts, gate blocking list and ladder
 * move with it; the 201 re-applies the same reducer with the real suppression
 * id; a failure restores every snapshot and raises a toast carrying
 * `POST /v1/findings/{id}/suppress · <status>`. Afterwards the findings, the
 * ledger, the audit trail and the run counts are refetched.
 */
export function useSuppressFinding(options: WriteHookOptions = {}): UseMutationResult<SuppressionCreated, ApiError, SuppressVariables, SuppressContext> {
  const queryClient = useQueryClient();
  const notify = options.notify ?? true;
  return useMutation<SuppressionCreated, ApiError, SuppressVariables, SuppressContext>({
    mutationKey: ["suppressFinding"],
    mutationFn: ({ findingId, request, actorId }) =>
      unwrapWrite(
        suppressFinding({
          path: { finding_id: findingId },
          body: request,
          headers: actorId ? { "X-Actor-Id": actorId } : undefined,
          throwOnError: true,
        }),
        { method: "POST", path: `/v1/findings/${findingId}/suppress` },
      ),
    onMutate: async ({ findingId, request, actorId }) => {
      // An in-flight refetch must not land on top of the optimistic state.
      await queryClient.cancelQueries({ predicate: FINDING_HOLDERS });
      const snapshot = queryClient.getQueriesData({ predicate: FINDING_HOLDERS });
      patchCaches(queryClient, findingId, patchFromRequest(request, { tempId: tempId(), actorId }));
      return { snapshot };
    },
    onSuccess: (created, { findingId }) => {
      patchCaches(queryClient, findingId, patchFromCreated(created));
      if (notify) toastWriteSuccess("SUPPRESSION RECORDED", "POST", `/v1/findings/${findingId}/suppress`, created);
    },
    onError: (error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toastWriteFailure("SUPPRESSION ROLLED BACK", error);
    },
    onSettled: () => invalidateSuppressionAffected(queryClient),
  });
}

/**
 * DELETE /v1/suppressions/{id} — a revocation: the row stays in the ledger with
 * revoked_at set, and a `suppression.revoked` event joins the audit trail.
 * Returns the updated row. A failure raises `DELETE /v1/suppressions/{id} · <status>`.
 */
export function useRevokeSuppression(
  options: WriteHookOptions = {},
): UseMutationResult<SuppressionItem, ApiError, { suppressionId: string; actorId?: string | null }> {
  const queryClient = useQueryClient();
  const notify = options.notify ?? true;
  return useMutation<SuppressionItem, ApiError, { suppressionId: string; actorId?: string | null }>({
    mutationKey: ["revokeSuppression"],
    mutationFn: ({ suppressionId, actorId }) =>
      unwrapWrite(
        revokeSuppression({
          path: { suppression_id: suppressionId },
          headers: actorId ? { "X-Actor-Id": actorId } : undefined,
          throwOnError: true,
        }),
        { method: "DELETE", path: `/v1/suppressions/${suppressionId}` },
      ),
    onSuccess: (row, { suppressionId }) => {
      if (notify) toastWriteSuccess("SUPPRESSION REVOKED", "DELETE", `/v1/suppressions/${suppressionId}`, row);
    },
    onError: (error) => toastWriteFailure("SUPPRESSION NOT REVOKED", error),
    onSettled: () => invalidateSuppressionAffected(queryClient),
  });
}
