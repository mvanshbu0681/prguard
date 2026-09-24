// OWNER: t2a (wave 1).
//
// GET /v1/accuracy (spec §6.9): the self-report. Every metric arrives with its
// value, n and definition; the UI renders all three and authors none of them.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getAccuracyReportQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { getAccuracyReport } from "@/api/sdk.gen";
import type { AccuracyReport } from "@/lib/api-types";
import { unwrap } from "./internal";

export interface AccuracyWindowFilter {
  /** `owner/name` */
  repository?: string | null;
  /** ISO 8601 */
  since?: string | null;
  until?: string | null;
}

/** The report for a window. The response's own `window` says what it actually covers. */
export function useAccuracy(reportWindow: AccuracyWindowFilter = {}, options: { enabled?: boolean } = {}): UseQueryResult<AccuracyReport, ApiError> {
  const q: Record<string, string> = {};
  for (const key of ["repository", "since", "until"] as const) {
    const v = reportWindow[key];
    if (typeof v === "string" && v !== "") q[key] = v;
  }
  const query = Object.keys(q).length ? q : undefined;
  return useQuery<AccuracyReport, ApiError, AccuracyReport, ReturnType<typeof getAccuracyReportQueryKey>>({
    queryKey: getAccuracyReportQueryKey({ query }),
    queryFn: ({ signal }) => unwrap(getAccuracyReport({ query, signal, throwOnError: true }), { method: "GET", path: "/v1/accuracy" }),
    enabled: options.enabled ?? true,
    // Aggregates over weeks of runs: minutes-fresh is fresh.
    staleTime: 5 * 60_000,
  });
}
