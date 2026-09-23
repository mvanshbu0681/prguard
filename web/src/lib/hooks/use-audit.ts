// OWNER: t2a (wave 1).
//
// GET /v1/audit (spec §6.8), parsed LOSSLESSLY: the response is read as text and
// parsed with src/api/lossless.ts, so every non-integer number in a payload is a
// LosslessNumber that re-serialises to Python's lexeme (`1.0`, `1e-05`). The
// browser-side hash check (<ChainRail>, plan A8) depends on it; JSON.parse would
// produce a false chain break. Integers (seq, counts) stay plain numbers.
//
// The query key is the generated one plus `_lossless: true`, so it never shares
// a cache entry with the generated listAuditEventsOptions (which JSON.parses),
// while invalidating listAuditEventsQueryKey() still reaches it.
import { useInfiniteQuery, useQuery, type InfiniteData, type UseInfiniteQueryResult, type UseQueryResult } from "@tanstack/react-query";
import { listAuditEventsQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { parseLosslessJson } from "@/api/lossless";
import { listAuditEvents } from "@/api/sdk.gen";
import type { ListAuditEventsData } from "@/api/types.gen";
import type { AuditListWithTenant } from "@/lib/api-types";
import type { ActorType, AuditEventType } from "@/lib/contracts";
import { unwrap } from "./internal";

export interface AuditFilters {
  review_id?: string | null;
  finding_id?: string | null;
  event_type?: AuditEventType | (string & {}) | null;
  actor_type?: ActorType | null;
  /** ISO 8601; events at or after it. */
  since?: string | null;
  /** 1–500, default 500. */
  limit?: number | null;
  cursor?: string | null;
}

type AuditQuery = NonNullable<ListAuditEventsData["query"]>;

export function auditQuery(filters: AuditFilters = {}): AuditQuery | undefined {
  const q: Record<string, unknown> = {};
  for (const key of ["review_id", "finding_id", "event_type", "actor_type", "since", "cursor"] as const) {
    const v = filters[key];
    if (typeof v === "string" && v !== "") q[key] = v;
  }
  if (typeof filters.limit === "number") q.limit = filters.limit;
  return Object.keys(q).length ? (q as AuditQuery) : undefined;
}

export function auditQueryKey(query?: AuditQuery) {
  const [head] = listAuditEventsQueryKey(query ? { query } : undefined);
  return [{ ...head, _lossless: true as const }] as const;
}

export function auditInfiniteQueryKey(query?: AuditQuery) {
  const [head] = listAuditEventsQueryKey(query ? { query } : undefined);
  return [{ ...head, _lossless: true as const, _infinite: true as const }] as const;
}

async function fetchAudit(query: AuditQuery | undefined, signal: AbortSignal): Promise<AuditListWithTenant> {
  const text = await unwrap(listAuditEvents({ query, signal, throwOnError: true, parseAs: "text" }), { method: "GET", path: "/v1/audit" });
  return parseLosslessJson(text as unknown as string) as AuditListWithTenant;
}

/** One window of the chain (default and maximum 500 events) with the server's `chain` verdict. */
export function useAudit(filters: AuditFilters = {}, options: { enabled?: boolean } = {}): UseQueryResult<AuditListWithTenant, ApiError> {
  const query = auditQuery(filters);
  return useQuery<AuditListWithTenant, ApiError, AuditListWithTenant, ReturnType<typeof auditQueryKey>>({
    queryKey: auditQueryKey(query),
    queryFn: ({ signal }) => fetchAudit(query, signal),
    enabled: options.enabled ?? true,
  });
}

/** Windowed loading past 500 events: `fetchNextPage()` follows `page.next_cursor`. */
export function useAuditInfinite(
  filters: Omit<AuditFilters, "cursor"> = {},
  options: { enabled?: boolean } = {},
): UseInfiniteQueryResult<InfiniteData<AuditListWithTenant, string | null>, ApiError> {
  const query = auditQuery(filters);
  return useInfiniteQuery<AuditListWithTenant, ApiError, InfiniteData<AuditListWithTenant, string | null>, ReturnType<typeof auditInfiniteQueryKey>, string | null>({
    queryKey: auditInfiniteQueryKey(query),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => fetchAudit({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (last) => (last.page.has_more && last.page.next_cursor ? last.page.next_cursor : undefined),
    enabled: options.enabled ?? true,
  });
}
