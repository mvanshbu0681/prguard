// OWNER: T2 (wave 1) — t2a.
//
// The QueryClient and the real-time policy (dashboard §5), as pure functions so
// they can be tested without a network:
//   - never retry a 4xx: the request itself is wrong and repeating it cannot help;
//   - retry a transient failure (no response, 5xx) twice, backing off;
//   - poll a run every 1.2s while it is queued or running, stop at a terminal
//     status, and after a transient failure back off 1.2s → 2.4s → 4.8s → 9.6s,
//     capped at 10s, until a poll succeeds. A 4xx stops the poll (a missing run
//     does not come back); 429 is the one 4xx that backs off instead, because the
//     server is asking to be polled more slowly, not to be forgotten.
// During a backoff the query keeps its last data and counts the misses in
// `failureCount`, so the live view freezes at last-known state instead of
// resetting (dashboard §5.1: "losing telemetry is not the run failing").
import { QueryClient, isServer } from "@tanstack/react-query";
import { isApiError } from "@/api/errors";
import { LIVE_RUN_STATUSES, POLL_BACKOFF_CAP_MS, POLL_INTERVAL_MS, TERMINAL_RUN_STATUSES, type ReviewRunStatus } from "./contracts";

/** No response, a 5xx, or 429. Anything that is not an ApiError is not transient (a bug is not retried). */
export function isTransientError(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status === 0 || error.status >= 500 || error.status === 429;
}

/** True for every 4xx. */
export function isClientError(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500;
}

/** 1.2s, 2.4s, 4.8s, 9.6s, then 10s: the delay before retry number attempt+1. */
export function backoffDelay(attempt: number): number {
  return Math.min(POLL_INTERVAL_MS * 2 ** Math.max(0, attempt), POLL_BACKOFF_CAP_MS);
}

/** The default query retry: never a 4xx (429 included), at most two retries of a transient failure. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isClientError(error)) return false;
  return isTransientError(error) && failureCount < 2;
}

/** Status polls retry every transient failure, forever, on the backoff schedule. */
export function shouldRetryPoll(_failureCount: number, error: unknown): boolean {
  return isTransientError(error);
}

export function isTerminalStatus(status: ReviewRunStatus | null | undefined): boolean {
  return !!status && (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

export function isLiveStatus(status: ReviewRunStatus | null | undefined): boolean {
  return !!status && (LIVE_RUN_STATUSES as readonly string[]).includes(status);
}

/**
 * The next poll of GET /v1/reviews/{id}, from what the query knows now:
 * 1.2s while queued or running (or before the first answer), false once the
 * run is terminal or a non-transient error ended it.
 */
export function reviewPollInterval(status: ReviewRunStatus | null | undefined, error: unknown): number | false {
  if (isTerminalStatus(status)) return false;
  if (error && !isTransientError(error)) return false;
  return POLL_INTERVAL_MS;
}

/** Lists and details: fresh for 30s; the write hooks invalidate what they change. */
export const DEFAULT_STALE_TIME_MS = 30_000;

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        retry: shouldRetryQuery,
        retryDelay: backoffDelay,
      },
      mutations: {
        // A write is never repeated behind the user's back.
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** One client per browser tab; a fresh one per server render (TanStack's Next app-router pattern). */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
