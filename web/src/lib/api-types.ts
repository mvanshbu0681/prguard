// OWNER: T2 (wave 1). Stub from the integrator — replace entirely.
//
// The single import point for API shapes. Every component imports response types from
// HERE, never from `src/api/**` directly, so the generated client can be regenerated or
// swapped without touching components.
//
// T2 replaces each `unknown` below with a re-export of the generated type
// (web/openapi/openapi.json → components.schemas.<Name>). Until then these names exist so
// wave-1 tracks (T1a's props.ts in particular) can compile against them in parallel.
// Wave-1 code must not read properties off these types; wave 2 onwards gets real ones.

// GET /v1/reviews/{id} and /result
export type ReviewAccepted = unknown;
export type ReviewStatus = unknown;
export type ReviewResult = unknown;
export type RunCounts = unknown;
export type RunError = unknown;
export type GateInfo = unknown;
export type DeliveryInfo = unknown;
export type LadderBreakdown = unknown;
export type ResultCounts = unknown;
export type CostInfo = unknown;
export type TimingInfo = unknown;
export type ContextInfo = unknown;

// Findings — GET /v1/findings, /v1/findings/{id}
export type Finding = unknown;
export type FindingList = unknown;
export type FindingLocation = unknown;
export type FindingSeverity = unknown;
export type SeverityInputs = unknown;
export type FindingProof = unknown;
export type ProofExecution = unknown;
export type FindingDelivery = unknown;
export type FindingHistory = unknown;
export type FindingSuppression = unknown;

// Suppression ledger — POST /v1/findings/{id}/suppress, GET/DELETE /v1/suppressions
export type SuppressRequest = unknown;
export type SuppressionCreated = unknown;
export type SuppressionItem = unknown;
export type SuppressionList = unknown;

// Audit chain — GET /v1/audit
export type AuditItem = unknown;
/** Plan §5 calls it AuditEvent. Same thing. */
export type AuditEvent = AuditItem;
export type AuditChain = unknown;
export type AuditList = unknown;
/** Plan A9: the hash covers tenant_id but the API omits it. Fixtures carry it. */
export type AuditItemWithTenant = unknown;

// Accuracy self-report — GET /v1/accuracy
export type AccuracyReport = unknown;
export type AccuracyMetric = unknown;

export type PageInfo = unknown;

// Plan A11 — the one hand-written extension (GET /v1/reviews list), served by src/api/ext.ts
export type ReviewListItem = unknown;
