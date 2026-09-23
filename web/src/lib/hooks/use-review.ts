// OWNER: t2a (wave 1).
//
// Runs: the polled status (the live view), the result document, creating and
// re-running a review, and the run list (plan A11).
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { getReviewResultQueryKey, getReviewStatusQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { listReviewsOptions, listReviewsQueryKey, rememberCreatedReview } from "@/api/ext";
import { createReview, getReviewResult, getReviewStatus, rerunReview } from "@/api/sdk.gen";
import type { CreateReviewRequest, ListReviewsQuery, ReviewAccepted, ReviewList, ReviewResult, ReviewStatus } from "@/lib/api-types";
import { POLL_INTERVAL_MS } from "@/lib/contracts";
import { backoffDelay, isLiveStatus, reviewPollInterval, shouldRetryPoll } from "@/lib/query";
import { toastWriteFailure, toastWriteSuccess, unwrap, unwrapWrite, type WriteHookOptions } from "./internal";

/**
 * GET /v1/reviews/{id}, polled every 1.2s while the run is queued or running
 * (every 4s once it has been silent for 90s) and never after it is terminal
 * (dashboard §5). A transient failure keeps the last status and retries on the
 * backoff schedule (1.2s → 2.4s → 4.8s … 10s); `failureCount` is the number of
 * consecutive misses and `failureReason` the last one, which the live view
 * shows past three. A 404 stops the poll. seconds_since_heartbeat is the age at
 * the moment of the poll: the live view advances it with its own 1Hz ticker
 * (dashboard §5.1), anchored to `dataUpdatedAt`.
 */
export function useReviewStatus(reviewId: string | null | undefined, options: { enabled?: boolean } = {}): UseQueryResult<ReviewStatus, ApiError> {
  const path = { review_id: reviewId ?? "" };
  return useQuery<ReviewStatus, ApiError, ReviewStatus, ReturnType<typeof getReviewStatusQueryKey>>({
    queryKey: getReviewStatusQueryKey({ path }),
    queryFn: ({ signal }) => unwrap(getReviewStatus({ path, signal, throwOnError: true }), { method: "GET", path: `/v1/reviews/${path.review_id}` }),
    enabled: !!reviewId && (options.enabled ?? true),
    staleTime: 0,
    refetchInterval: (query) => reviewPollInterval(query.state.data?.status, query.state.error, query.state.data?.seconds_since_heartbeat),
    refetchIntervalInBackground: false,
    retry: shouldRetryPoll,
    retryDelay: backoffDelay,
  });
}

/**
 * GET /v1/reviews/{id}/result. The server answers 409 RESULT_NOT_READY while the
 * run is live, so enable this once useReviewStatus reports a terminal status —
 * or pass `partial: true` for what exists so far.
 */
export function useReviewResult(
  reviewId: string | null | undefined,
  options: { enabled?: boolean; partial?: boolean } = {},
): UseQueryResult<ReviewResult, ApiError> {
  const path = { review_id: reviewId ?? "" };
  const query = options.partial ? { partial: true } : undefined;
  return useQuery<ReviewResult, ApiError, ReviewResult, ReturnType<typeof getReviewResultQueryKey>>({
    queryKey: getReviewResultQueryKey({ path, query }),
    queryFn: ({ signal }) =>
      unwrap(getReviewResult({ path, query, signal, throwOnError: true }), { method: "GET", path: `/v1/reviews/${path.review_id}/result` }),
    enabled: !!reviewId && (options.enabled ?? true),
    // A partial result goes stale with every stage; a final one never changes.
    staleTime: options.partial ? 0 : Infinity,
  });
}

/** After a 202 the run starts over: drop any cached status or result for it and refresh the list. */
function onAccepted(queryClient: ReturnType<typeof useQueryClient>, accepted: ReviewAccepted): Promise<unknown> {
  rememberCreatedReview(accepted);
  const path = { review_id: accepted.review_id };
  queryClient.removeQueries({ queryKey: getReviewResultQueryKey({ path }) });
  return Promise.all([
    queryClient.resetQueries({ queryKey: getReviewStatusQueryKey({ path }) }),
    queryClient.invalidateQueries({ queryKey: listReviewsQueryKey() }),
  ]);
}

/**
 * POST /v1/reviews → 202 ReviewAccepted. In fixture mode every submission
 * replays the demo run (plan A5). On failure: a toast carrying
 * `POST /v1/reviews · <status>`. No success toast by default — the caller
 * navigates to the run, which is the confirmation; `notify: true` adds one.
 */
export function useCreateReview(options: WriteHookOptions = {}): UseMutationResult<ReviewAccepted, ApiError, CreateReviewRequest> {
  const queryClient = useQueryClient();
  const notify = options.notify ?? false;
  return useMutation<ReviewAccepted, ApiError, CreateReviewRequest>({
    mutationKey: ["createReview"],
    mutationFn: (body) => unwrapWrite(createReview({ body, throwOnError: true }), { method: "POST", path: "/v1/reviews" }),
    onSuccess: (accepted) => {
      if (notify) toastWriteSuccess(accepted.deduplicated ? "REVIEW DEDUPLICATED" : "REVIEW QUEUED", "POST", "/v1/reviews", accepted);
      return onAccepted(queryClient, accepted);
    },
    onError: (error) => toastWriteFailure("REVIEW NOT QUEUED", error),
  });
}

/** POST /v1/reviews/{id}/rerun → 202 ReviewAccepted, with a `RE-RUN QUEUED` toast (`notify: false` drops it). */
export function useRerunReview(options: WriteHookOptions = {}): UseMutationResult<ReviewAccepted, ApiError, { reviewId: string }> {
  const queryClient = useQueryClient();
  const notify = options.notify ?? true;
  return useMutation<ReviewAccepted, ApiError, { reviewId: string }>({
    mutationKey: ["rerunReview"],
    mutationFn: ({ reviewId }) =>
      unwrapWrite(rerunReview({ path: { review_id: reviewId }, throwOnError: true }), { method: "POST", path: `/v1/reviews/${reviewId}/rerun` }),
    onSuccess: (accepted, { reviewId }) => {
      if (notify) toastWriteSuccess("RE-RUN QUEUED", "POST", `/v1/reviews/${reviewId}/rerun`, accepted);
      return onAccepted(queryClient, accepted);
    },
    onError: (error) => toastWriteFailure("RE-RUN NOT QUEUED", error),
  });
}

/**
 * GET /v1/reviews — the run list (plan A11, not in the backend). Fixture mode
 * serves reviews/index.json; live mode lists the runs this browser created.
 * Polls at 1.2s while any listed run is live.
 */
export function useReviewList(query?: ListReviewsQuery, options: { enabled?: boolean } = {}): UseQueryResult<ReviewList, ApiError> {
  return useQuery<ReviewList, ApiError, ReviewList, ReturnType<typeof listReviewsQueryKey>>({
    ...listReviewsOptions(query ? { query } : undefined),
    enabled: options.enabled ?? true,
    refetchInterval: (q) => (q.state.data?.items.some((r) => isLiveStatus(r.status)) ? POLL_INTERVAL_MS : false),
    refetchIntervalInBackground: false,
  });
}
