// OWNER: t2a (wave 1).
//
// Every data hook, typed from @/lib/api-types. Import from "@/lib/hooks".
//
// Reads: `error` is always an ApiError (status, §6.0 code and details,
// endpoint, request id). Read failures are for the caller's inline error frame;
// they never toast (dashboard §2.0).
//
// Writes raise toasts in t1b's shape (design §5.14): a mono caps title of four
// words at most, then a provenance line with plan A10's short ids —
//   SUPPRESSION ROLLED BACK · POST /v1/findings/a91f3c2e/suppress · 422 · fx_00000c · VALIDATION_ERROR: …
// A failure always toasts and stays until dismissed. A success toasts for
// suppress, revoke and re-run (pass { notify: false } to keep it quiet); create
// is quiet unless { notify: true }, because the caller navigates to the run.
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
  findingTransition,
  applyTransitionToResultCounts,
  applyTransitionToRunCounts,
  gateReason,
  PENDING_SUPPRESSION_PREFIX,
  type SuppressionPatch,
  type FindingTransition,
} from "./suppress-reducer";
export { invalidateSuppressionAffected, SUPPRESSION_AFFECTED, OPERATION, errorSummary, writeLine, type WriteHookOptions } from "./internal";

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

// Errors: the one error type, its guards, and plan A10's short ids for printing a path.
export { ApiError, isApiError, toApiError, shortenPathIds } from "@/api/errors";
// Polling helpers, for the live view.
export { isTerminalStatus, isLiveStatus, isTransientError, reviewPollInterval, backoffDelay } from "@/lib/query";
