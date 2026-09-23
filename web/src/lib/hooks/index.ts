// OWNER: t2a (wave 1).
//
// Every data hook, typed from @/lib/api-types. `error` is always an ApiError
// (status, §6.0 code, endpoint); write failures raise a toast carrying
// `<METHOD> <path> · <status>`. Import from "@/lib/hooks".
export { useReviewStatus, useReviewResult, useCreateReview, useRerunReview, useReviewList } from "./use-review";
export { useFindings, useFindingsInfinite, useFinding, findingsQuery, type FindingFilters } from "./use-findings";
export {
  useSuppressions,
  useSuppressFinding,
  useRevokeSuppression,
  suppressionsQuery,
  type SuppressionFilters,
  type SuppressVariables,
} from "./use-suppressions";
export { useAudit, useAuditInfinite, auditQuery, auditQueryKey, auditInfiniteQueryKey, type AuditFilters } from "./use-audit";
export { useAccuracy, type AccuracyWindowFilter } from "./use-accuracy";
export { useHealthz, useReadyz } from "./use-health";
export {
  findingFilterParsers,
  suppressionFilterParsers,
  auditFilterParsers,
  useFindingFilters,
  useSuppressionFilters,
  useAuditFilters,
  findingsHref,
  suppressionsHref,
  auditHref,
} from "./url-state";
export {
  suppressFindingReducer,
  patchFromRequest,
  patchFromCreated,
  isPendingSuppression,
  applySuppressionToFinding,
  applySuppressionToList,
  applySuppressionToPages,
  applySuppressionToResult,
  PENDING_SUPPRESSION_PREFIX,
  type SuppressionPatch,
} from "./suppress-reducer";
export { invalidateSuppressionAffected, SUPPRESSION_AFFECTED, OPERATION } from "./internal";

// Query keys (generated style), for prefetching and precise invalidation.
export {
  getReviewStatusQueryKey,
  getReviewResultQueryKey,
  listFindingsQueryKey,
  listFindingsInfiniteQueryKey,
  getFindingQueryKey,
  listSuppressionsQueryKey,
  listAuditEventsQueryKey,
  getAccuracyReportQueryKey,
  healthzQueryKey,
  readyzQueryKey,
} from "@/api/@tanstack/react-query.gen";
export { listReviewsQueryKey, listReviewsOptions, getRememberedReviews, rememberCreatedReview } from "@/api/ext";

// Errors: the one error type, and its guards.
export { ApiError, isApiError, toApiError } from "@/api/errors";
// Polling helpers, for the live view.
export { isTerminalStatus, isLiveStatus, isTransientError, reviewPollInterval, backoffDelay } from "@/lib/query";
