// OWNER: T2 (wave 1) — t2a. Frozen after wave 1 merges (only T2 may change it).
// The first block is transcribed verbatim from plan §5 and is never renamed or
// reordered. Everything below it is additive: the enums, the §6.0 error-code
// registry and the real-time policy constants the data layer and the dashboard
// share. src/lib/api-types.ts asserts at compile time that every union here
// equals the corresponding generated type, so this file cannot drift from
// web/openapi/openapi.json.

export type ProofStatus = 'proven' | 'disproven' | 'inconclusive' | 'not_attempted' | 'not_applicable' | 'skipped_no_env';
export type SeverityBand = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type GateConclusion = 'failure' | 'neutral' | 'success';
export type FindingStatus = 'proposed' | 'published' | 'suppressed' | 'dropped' | 'disproven';
export type StageState = 'pending' | 'running' | 'done' | 'degraded' | 'failed';
export type DeliveryMode = 'inline_exact' | 'inline_nearest' | 'file_level' | 'summary_only' | 'not_delivered';

/** Canonical, fixed, never reordered — weight descending, ties by declaration order.
 *  Fixed order is what makes the 64px glyph comparable across 1,284 rows at a glance. */
export const SEVERITY_INPUTS = [
  'path_sensitivity',   // 0.25
  'reachability',       // 0.20
  'blast_radius',       // 0.15
  'coverage_gap',       // 0.15
  'proof_confidence',   // 0.15  — the only input about the system's own certainty; renders hatched
  'churn',              // 0.10
] as const;

export const SEVERITY_THRESHOLDS = { low: 0.15, medium: 0.35, high: 0.55, critical: 0.75 } as const;

export const STAGES = [
  'ingest', 'context', 'specialists', 'coordinator', 'severity',
  'identity', 'proof', 'delivery', 'finalise',
] as const;   // stage_index is 1-based to match GET /v1/reviews/{id}

// ---------------------------------------------------------------------------
// Additions (t2a, wave 1). Additive only.
// ---------------------------------------------------------------------------

export type Stage = (typeof STAGES)[number];
export type SeverityInput = (typeof SEVERITY_INPUTS)[number];

/** GET /v1/reviews/{id} → status (spec §6.2). */
export type ReviewRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export const REVIEW_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const satisfies readonly ReviewRunStatus[];
/** Polling stops at these (dashboard §5). */
export const TERMINAL_RUN_STATUSES = ['succeeded', 'failed', 'cancelled'] as const satisfies readonly ReviewRunStatus[];
/** The run is still producing output; the live view renders and polling runs. */
export const LIVE_RUN_STATUSES = ['queued', 'running'] as const satisfies readonly ReviewRunStatus[];

export type ReviewTrigger = 'api' | 'webhook' | 'rerun';
export type RiskTier = 'trivial' | 'standard' | 'full';
export const RISK_TIERS = ['trivial', 'standard', 'full'] as const satisfies readonly RiskTier[];

/** Ascending. `severity_min` is a floor in this order (spec §6.5). */
export const SEVERITY_BANDS = ['info', 'low', 'medium', 'high', 'critical'] as const satisfies readonly SeverityBand[];

export const PROOF_STATUSES = [
  'proven', 'disproven', 'inconclusive', 'not_attempted', 'not_applicable', 'skipped_no_env',
] as const satisfies readonly ProofStatus[];

export const FINDING_STATUSES = ['proposed', 'published', 'suppressed', 'dropped', 'disproven'] as const satisfies readonly FindingStatus[];

export type FindingCategory = 'correctness' | 'security' | 'test_integrity' | 'performance' | 'maintainability';
export const FINDING_CATEGORIES = [
  'correctness', 'security', 'test_integrity', 'performance', 'maintainability',
] as const satisfies readonly FindingCategory[];

/** The comment ladder, top rung first (spec §4.7). `not_delivered` is not a rung. */
export const DELIVERY_MODES = [
  'inline_exact', 'inline_nearest', 'file_level', 'summary_only', 'not_delivered',
] as const satisfies readonly DeliveryMode[];

export const GATE_CONCLUSIONS = ['failure', 'neutral', 'success'] as const satisfies readonly GateConclusion[];
/** The gate ladder, top rung first (spec §4.7). */
export type GateDelivery = 'check_run' | 'commit_status' | 'dry_run';
export const GATE_DELIVERIES = ['check_run', 'commit_status', 'dry_run'] as const satisfies readonly GateDelivery[];

export type SuppressionScope = 'line' | 'file' | 'pattern' | 'repo' | 'tenant';
export const SUPPRESSION_SCOPES = ['line', 'file', 'pattern', 'repo', 'tenant'] as const satisfies readonly SuppressionScope[];

export type ActorType = 'ai' | 'human' | 'system';
export const ACTOR_TYPES = ['ai', 'human', 'system'] as const satisfies readonly ActorType[];

/** audit_events.event_type (spec §5.1). */
export const AUDIT_EVENT_TYPES = [
  'review.requested', 'review.started', 'review.stage_completed', 'review.degraded',
  'review.failed', 'review.completed', 'finding.proposed', 'finding.suppressed',
  'finding.published', 'finding.disproven', 'proof.generated', 'proof.executed',
  'gate.evaluated', 'gate.delivered', 'suppression.created', 'suppression.revoked',
  'override.break_glass',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** The §6.0 code registry: every non-2xx body is `{ error: { code, message,
 *  details, request_id } }` with one of these codes; the value is its HTTP status. */
export const API_ERROR_CODES = {
  INVALID_PR_URL: 422,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  INVALID_SIGNATURE: 401,
  WEBHOOK_NOT_CONFIGURED: 503,
  REVIEW_NOT_FOUND: 404,
  FINDING_NOT_FOUND: 404,
  SUPPRESSION_NOT_FOUND: 404,
  PR_NOT_FOUND: 404,
  REPO_FORBIDDEN: 403,
  RESULT_NOT_READY: 409,
  GITHUB_UNAVAILABLE: 502,
  LLM_UNAVAILABLE: 502,
  DATABASE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_CODES;

/** List endpoints (spec §6.5, §6.7, §6.8). */
export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;
export const AUDIT_LIMIT_DEFAULT = 500;
export const AUDIT_LIMIT_MAX = 500;

/** Real-time policy (dashboard §5, §5.1). Polling, never SSE. */
export const POLL_INTERVAL_MS = 1200;
/** Backoff after consecutive transient failures: 1.2s → 2.4s → 4.8s → 9.6s → cap. */
export const POLL_BACKOFF_CAP_MS = 10_000;
/** A run silent for longer than this is polled at POLL_STUCK_INTERVAL_MS instead (dashboard §5: do not hammer a stuck run). */
export const POLL_STUCK_AFTER_SECONDS = 90;
export const POLL_STUCK_INTERVAL_MS = 4000;
/** Heartbeat age thresholds, seconds: the dot stops and turns --marker, then
 *  --alarm with [Re-run], then the stage rail dims ("run appears stalled"). */
export const HEARTBEAT_STALE_SECONDS = 20;
export const HEARTBEAT_ALARM_SECONDS = 45;
export const HEARTBEAT_STALLED_SECONDS = 120;
