// OWNER: T2 (wave 1) — t2a.
//
// The single import point for API shapes. Components import response types from
// HERE, never from src/api/** directly, so the generated client can be
// regenerated or swapped without touching a component. Every name is a
// re-export of the type generated from web/openapi/openapi.json
// (components.schemas.<Name>; `npm run api:gen`), plus the plan-A11 extension and
// the fixture-only ("Ext") file shapes.
//
// The block at the bottom asserts at compile time that the hand-written unions
// in @/lib/contracts equal the generated enums, so `tsc` fails the moment the
// schema and the contracts disagree.
import type * as Gen from "@/api/types.gen";
import type {
  ActorType,
  DeliveryMode,
  FindingCategory,
  FindingStatus,
  GateConclusion,
  GateDelivery,
  ProofStatus,
  ReviewRunStatus,
  ReviewTrigger,
  RiskTier,
  SeverityBand,
  SeverityInput,
  SuppressionScope,
} from "./contracts";
import type { AuditItemWithTenant } from "./fixture-types";

// GET /v1/reviews/{id} and /result — POST /v1/reviews
export type {
  ReviewAccepted,
  ReviewStatus,
  ReviewResult,
  RunCounts,
  RunError,
  GateInfo,
  DeliveryInfo,
  LadderBreakdown,
  ResultCounts,
  CostInfo,
  TimingInfo,
  ContextInfo,
  CreateReviewRequest,
  ReviewOptions,
  RepositoryInfo,
  RepositoryRef,
  PullRequestInfo,
  PullRequestRef,
} from "@/api/types.gen";

// Findings — GET /v1/findings, /v1/findings/{id}
export type {
  Finding,
  FindingList,
  FindingTotals,
  FindingLocation,
  FindingSeverity,
  SeverityInputs,
  FindingProof,
  ProofExecution,
  FindingDelivery,
  FindingHistory,
  FindingSuppression,
} from "@/api/types.gen";

// Suppression ledger — POST /v1/findings/{id}/suppress, GET/DELETE /v1/suppressions
export type {
  SuppressRequest,
  SuppressionCreated,
  SuppressionItem,
  SuppressionList,
  SuppressionTotals,
  AffectedFindings,
} from "@/api/types.gen";

// Audit chain — GET /v1/audit
export type { AuditItem, AuditChain, AuditList } from "@/api/types.gen";
/** Plan §5 calls it AuditEvent. Same thing. */
export type AuditEvent = Gen.AuditItem;
/** Plan A9: the hash covers tenant_id but the API omits it. Fixtures carry it;
 *  in fixture mode GET /v1/audit serves it, in live mode it is absent. */
export type { AuditItemWithTenant };
/** GET /v1/audit as the audit hooks return it: items may carry tenant_id, and
 *  every non-integer payload number is a LosslessNumber (src/api/lossless.ts). */
export type AuditListWithTenant = Omit<Gen.AuditList, "items"> & { items?: AuditItemWithTenant[] };

// Accuracy self-report — GET /v1/accuracy
export type {
  AccuracyReport,
  AccuracyMetric,
  AccuracyWindow,
  AccuracyRuns,
  AccuracyFindings,
  AccuracyProof,
  AccuracyPrecisionProxies,
  AccuracyGate,
} from "@/api/types.gen";

// Health — GET /healthz, /readyz
export type { HealthResponse, ReadyResponse, WorkersStatus } from "@/api/types.gen";

// Webhooks — POST /webhooks/github
export type { WebhookAccepted, WebhookDuplicate, WebhookIgnored } from "@/api/types.gen";

// Paging and FastAPI's validation body
export type { PageInfo, HttpValidationError, ValidationError } from "@/api/types.gen";
/** The components.schemas name. */
export type HTTPValidationError = Gen.HttpValidationError;

// Plan A11 — the one hand-written extension (GET /v1/reviews list), served by src/api/ext.ts
export type { ReviewListItem, ReviewList, ListReviewsQuery } from "@/api/ext";

// The §6.0 error envelope and the error every hook surfaces
export type { ErrorEnvelope, ApiError } from "@/api/errors";

// Fixture-only file shapes (web/public/fixtures/README.md) — the "Ext" files
export type {
  DemoIds,
  FixtureManifest,
  ReviewsIndexFile,
  FindingsIndexFile,
  SuppressionsIndexFile,
  AuditEventsFile,
  CanonicalVector,
  CanonicalVectorsFile,
  AccuracySeries,
  CostSummary,
  DemoRun,
} from "./fixture-types";

// ---------------------------------------------------------------------------
// Compile-time agreement between @/lib/contracts and the generated schema.
// ---------------------------------------------------------------------------
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type ContractChecks = [
  Assert<Exact<ProofStatus, Gen.FindingProof["status"]>>,
  Assert<Exact<SeverityBand, Gen.FindingSeverity["band"]>>,
  Assert<Exact<GateConclusion, Gen.GateInfo["conclusion"]>>,
  Assert<Exact<FindingStatus, Gen.Finding["status"]>>,
  Assert<Exact<DeliveryMode, Gen.FindingDelivery["mode"]>>,
  Assert<Exact<FindingCategory, Gen.Finding["category"]>>,
  Assert<Exact<ReviewRunStatus, Gen.ReviewStatus["status"]>>,
  Assert<Exact<ReviewTrigger, Gen.ReviewAccepted["trigger"]>>,
  Assert<Exact<RiskTier, NonNullable<Gen.ReviewStatus["risk_tier"]>>>,
  Assert<Exact<SuppressionScope, Gen.SuppressRequest["scope"]>>,
  Assert<Exact<ActorType, Gen.AuditItem["actor_type"]>>,
  Assert<Exact<GateDelivery, NonNullable<Gen.GateInfo["delivery"]>>>,
  Assert<Exact<SeverityInput, keyof Gen.SeverityInputs>>,
];
