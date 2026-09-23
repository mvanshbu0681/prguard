// OWNER: T2 (wave 1). Stub from T0 — replace entirely.
// Contents transcribed verbatim from plan §5 so the types exist from wave 0.
// T2 may extend it; it is frozen after wave 1 merges (only T2 may change it).

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
