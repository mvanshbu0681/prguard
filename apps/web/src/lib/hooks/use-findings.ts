// OWNER: t2a (wave 1).
//
// GET /v1/findings (spec §6.5) as a single page and as a cursor-paged
// ("Load more") infinite query, and GET /v1/findings/{id}.
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getFindingQueryKey, listFindingsInfiniteQueryKey, listFindingsQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { getFinding, listFindings } from "@/api/sdk.gen";
import type { ListFindingsData } from "@/api/types.gen";
import type { Finding, FindingList } from "@/lib/api-types";
import type { FindingStatus, ProofStatus, SeverityBand } from "@/lib/contracts";
import { unwrap } from "./internal";

/** Every §6.5 filter. `proof_status` may be repeated (see the note on findingsQuery). */
export interface FindingFilters {
  review_id?: string | null;
  /** `owner/name` */
  repository?: string | null;
  pr_number?: number | null;
  fingerprint?: string | null;
  status?: FindingStatus | null;
  /** A band floor: `high` keeps high and critical. */
  severity_min?: SeverityBand | null;
  blocking?: boolean | null;
  proof_status?: ProofStatus | readonly ProofStatus[] | null;
  /** 1–200, default 50. */
  limit?: number | null;
  cursor?: string | null;
}

type FindingsQuery = NonNullable<ListFindingsData["query"]>;

/**
 * The request query for a filter set, normalised so that equivalent filters
 * share one cache entry: empty values dropped, a one-element proof_status list
 * sent as a single value, a longer one sorted and sent as repeated keys.
 *
 * Repeated proof_status is served by the fixture resolver. The backend's §6.5
 * parameter is single-valued today, so live mode applies only one value — a
 * backend ask (make it a list) raised by t2a.
 */
export function findingsQuery(filters: FindingFilters = {}): FindingsQuery | undefined {
  const q: Record<string, unknown> = {};
  for (const key of ["review_id", "repository", "fingerprint", "status", "severity_min", "cursor"] as const) {
    const v = filters[key];
    if (typeof v === "string" && v !== "") q[key] = v;
  }
  if (typeof filters.pr_number === "number") q.pr_number = filters.pr_number;
  if (typeof filters.blocking === "boolean") q.blocking = filters.blocking;
  if (typeof filters.limit === "number") q.limit = filters.limit;
  const proof = typeof filters.proof_status === "string" ? [filters.proof_status] : [...new Set(filters.proof_status ?? [])].sort();
  if (proof.length === 1) q.proof_status = proof[0];
  else if (proof.length > 1) q.proof_status = proof;
  return Object.keys(q).length ? (q as FindingsQuery) : undefined;
}

/** One page of findings. Keeps the previous page on screen while a new filter loads. */
export function useFindings(filters: FindingFilters = {}, options: { enabled?: boolean } = {}): UseQueryResult<FindingList, ApiError> {
  const query = findingsQuery(filters);
  return useQuery<FindingList, ApiError, FindingList, ReturnType<typeof listFindingsQueryKey>>({
    queryKey: listFindingsQueryKey({ query }),
    queryFn: ({ signal }) => unwrap(listFindings({ query, signal, throwOnError: true }), { method: "GET", path: "/v1/findings" }),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/**
 * Cursor pagination for [Load more] (dashboard §2.6: never infinite scroll).
 * `fetchNextPage()` requests `cursor = page.next_cursor` until `has_more` is false;
 * `data.pages[n].totals.matched` is the count to print ("Showing 1–50 of 1,284").
 */
export function useFindingsInfinite(
  filters: Omit<FindingFilters, "cursor"> = {},
  options: { enabled?: boolean } = {},
): UseInfiniteQueryResult<InfiniteData<FindingList, string | null>, ApiError> {
  const query = findingsQuery(filters);
  return useInfiniteQuery<FindingList, ApiError, InfiniteData<FindingList, string | null>, ReturnType<typeof listFindingsInfiniteQueryKey>, string | null>({
    queryKey: listFindingsInfiniteQueryKey({ query }),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      unwrap(listFindings({ query: { ...query, ...(pageParam ? { cursor: pageParam } : {}) }, signal, throwOnError: true }), {
        method: "GET",
        path: "/v1/findings",
      }),
    getNextPageParam: (last) => (last.page.has_more && last.page.next_cursor ? last.page.next_cursor : undefined),
    enabled: options.enabled ?? true,
  });
}

/** GET /v1/findings/{id}. A missing finding is a 404 FINDING_NOT_FOUND and is not retried. */
export function useFinding(findingId: string | null | undefined, options: { enabled?: boolean } = {}): UseQueryResult<Finding, ApiError> {
  const path = { finding_id: findingId ?? "" };
  return useQuery<Finding, ApiError, Finding, ReturnType<typeof getFindingQueryKey>>({
    queryKey: getFindingQueryKey({ path }),
    queryFn: ({ signal }) => unwrap(getFinding({ path, signal, throwOnError: true }), { method: "GET", path: `/v1/findings/${path.finding_id}` }),
    enabled: !!findingId && (options.enabled ?? true),
  });
}
