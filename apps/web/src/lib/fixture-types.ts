// OWNER: t2a (wave 1).
//
// The shapes of the files in web/public/fixtures, transcribed from
// web/public/fixtures/README.md — the contract with t2b, which generates them.
// Files that mirror an API response reuse the generated types; the "Ext" files
// (not served by the backend today, plan A11) are typed here. Consumers import
// all of these from @/lib/api-types, never from this file.
//
// Until t2b's generator runs, every file is a stub `{ "_stub": true, ... }`.
// isFixtureStub() is how the resolver and the server loaders tell.
import type { AuditChain, AuditItem, Finding, RepositoryRef, SuppressionItem, SuppressionTotals } from "@/api/types.gen";
import type { ReviewListItem } from "@/api/ext";
import type { SeverityBand, Stage } from "./contracts";

/** Plan A9: the hash covers tenant_id but the API's AuditItem omits it. Fixtures carry it. */
export type AuditItemWithTenant = AuditItem & { tenant_id?: string };

/** manifest.json → ids. Final and binding (plan A10); the generator may add more keys. */
export interface DemoIds {
  tenant_id: string;
  demo_review_id: string;
  proven_finding_id: string;
  disproven_finding_id: string;
  inconclusive_finding_id: string;
  base_sha: string;
  head_sha: string;
  repository: RepositoryRef;
  pr_number: number;
  repro_test_path: string;
  failing_test: string;
  tamper_demo_seq: number;
  // Added by the generator after the binding ids (web/public/fixtures/README.md).
  superseded_review_id: string;
  first_push_sha: string;
  not_attempted_finding_id: string;
  suppressed_finding_id: string;
  demo_suppression_id: string;
  proven_fingerprint: string;
  break_glass_seq: number;
}

/** manifest.json */
export interface FixtureManifest {
  generator: { script: string; backend_commit: string; version: number };
  ids: DemoIds;
  /** Totals of everything generated, for tests. */
  counts: Record<string, number>;
}

/** reviews/index.json — Ext. ~40 runs across ~6 repos, newest first. */
export interface ReviewsIndexFile {
  items: ReviewListItem[];
}

/** findings/index.json — every finding across every run. */
export interface FindingsIndexFile {
  items: Finding[];
}

/** suppressions/index.json */
export interface SuppressionsIndexFile {
  items: SuppressionItem[];
  totals: SuppressionTotals;
}

/** audit/events.json — the tenant's whole chain, contiguous seq, ascending. */
export interface AuditEventsFile {
  items: AuditItemWithTenant[];
  chain: AuditChain;
}

/** audit/vectors.json — cross-language canonical-JSON test vectors (plan A8). */
export interface CanonicalVector {
  name: string;
  /** The exact dict the backend hashed. */
  document: Record<string, unknown>;
  prev_hash: string | null;
  /** Python's canonical_json(document). */
  canonical: string;
  /** compute_event_hash(prev_hash, document). */
  hash: string;
}
export interface CanonicalVectorsFile {
  items: CanonicalVector[];
}

/** accuracy/series.json — Ext. Every number carries its n. */
export interface AccuracySeries {
  weekly: { week_start: string; proven: number; disproven: number; inconclusive: number; skipped_no_env: number; not_attempted: number; not_applicable: number }[];
  dismissal_by_category: { category: string; dismissed: number; published: number }[];
  /** n = the addressed_rate population in the band; published_n = every published finding in it. */
  calibration: { band: SeverityBand; predicted_score_mean: number; addressed: number; n: number; published_n: number }[];
  /** The raw counts accuracy/report.json was computed from (plan A7). */
  raw_counts: Record<string, unknown>;
}

/** cost/summary.json — Ext. */
export interface CostSummary {
  window: string | { since?: string | null; until?: string | null };
  /** Nine rows, STAGES order. */
  per_stage: { stage: Stage; p50_s: number; p95_s: number }[];
  cost_histogram: { bin_start_usd: number; bin_end_usd: number; runs: number }[];
  cost_p50_usd: number;
  cost_p95_usd: number;
  cache_hit: { day: string; cache_read_tokens: number; input_tokens: number }[];
}

/** live/demo-run.json — Ext. The simulated live run (plan A5). */
export interface DemoRun {
  review_id: string;
  /** Multiplies every duration_ms. */
  time_scale: number;
  /** Nine rows, STAGES order. */
  stages: { key: Stage; duration_ms: number; label: string }[];
  heartbeat_interval_ms: number;
  /** Paths relative to web/public/fixtures. */
  final_status_file: string;
  final_result_file: string;
}

/** The files, by role. Paths are relative to web/public/fixtures. */
export const FIXTURE_FILES = {
  manifest: "manifest.json",
  reviewsIndex: "reviews/index.json",
  reviewStatus: (reviewId: string) => `reviews/${reviewId}.status.json`,
  reviewResult: (reviewId: string) => `reviews/${reviewId}.result.json`,
  findingsIndex: "findings/index.json",
  suppressionsIndex: "suppressions/index.json",
  auditEvents: "audit/events.json",
  auditVectors: "audit/vectors.json",
  accuracyReport: "accuracy/report.json",
  accuracySeries: "accuracy/series.json",
  costSummary: "cost/summary.json",
  demoRun: "live/demo-run.json",
} as const;

export interface FixtureStub {
  _stub: true;
}

/** True for a placeholder file the generator has not written yet. */
export function isFixtureStub(value: unknown): value is FixtureStub {
  return typeof value === "object" && value !== null && (value as { _stub?: unknown })._stub === true;
}
