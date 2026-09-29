// The policy, as the backend actually reads it. Every key is a field of
// apps/api/src/prguard/config.py's Settings — "Field names are the env var
// names; nothing is renamed" — so a draft exports to .env lines verbatim, and
// validation mirrors the startup validators there (weights sum to 1.0 and
// cover every input; band thresholds strictly ordered).
//
// There is no settings endpoint, so the live values are config.py's defaults,
// except SEVERITY_WEIGHTS, which is read off a real finding's
// severity.weights (the weights that finding was actually scored with).
//
// The gate impact recomputes `blocking` client-side with the backend's own
// rule (core/severity.py): score = round(Σ weight × clamp01(input), 3), band
// by >= thresholds (disproven clamps to info), and
//   blocking = proven AND band >= BLOCK_MIN_SEVERITY AND python AND published.
// With the live policy it reproduces every fixture finding's `blocking` flag
// (policy-model.test.ts).
import { SEVERITY_BANDS as BAND_ORDER, SEVERITY_INPUTS, SEVERITY_THRESHOLDS, type SeverityBand, type SeverityInput } from "@/lib/contracts";
import type { Finding } from "@/lib/api-types";

export type DeliveryModeSetting = "auto" | "post" | "dry_run";
export type Weights = Record<SeverityInput, number>;
export interface Thresholds {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface Policy {
  BLOCK_MIN_SEVERITY: SeverityBand;
  SEVERITY_WEIGHTS: Weights;
  SEVERITY_BANDS: Thresholds;
  PROOF_MIN_SCORE: number;
  PROOF_MAX_PER_RUN: number;
  PROOF_TIMEOUT: number;
  DEP_INSTALL_TIMEOUT: number;
  PROOF_REQUIRE_BASELINE: boolean;
  GITHUB_DELIVERY_MODE: DeliveryModeSetting;
  REVIEW_DRAFT_PRS: boolean;
}
export type PolicyKey = keyof Policy;

/** config.py's DEFAULT_SEVERITY_WEIGHTS, in the order its JSON is written. */
export const DEFAULT_WEIGHTS: Weights = {
  reachability: 0.2,
  blast_radius: 0.15,
  path_sensitivity: 0.25,
  coverage_gap: 0.15,
  churn: 0.1,
  proof_confidence: 0.15,
};

/** Settings defaults, transcribed from config.py (spec §4.8). */
export const CONFIG_DEFAULTS: Policy = {
  BLOCK_MIN_SEVERITY: "high",
  SEVERITY_WEIGHTS: DEFAULT_WEIGHTS,
  SEVERITY_BANDS: { ...SEVERITY_THRESHOLDS },
  PROOF_MIN_SCORE: 0.35,
  PROOF_MAX_PER_RUN: 3,
  PROOF_TIMEOUT: 90,
  DEP_INSTALL_TIMEOUT: 180,
  PROOF_REQUIRE_BASELINE: true,
  GITHUB_DELIVERY_MODE: "auto",
  REVIEW_DRAFT_PRS: false,
};

/** The live policy: config defaults, with the weights a real finding was scored with. */
export function livePolicy(findingWeights?: Record<string, number> | null): Policy {
  if (!findingWeights) return CONFIG_DEFAULTS;
  const weights = Object.fromEntries(SEVERITY_INPUTS.map((k) => [k, findingWeights[k] ?? 0])) as Weights;
  return { ...CONFIG_DEFAULTS, SEVERITY_WEIGHTS: weights };
}

const EPS = 1e-6;

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < EPS;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    return ka.length === Object.keys(b as object).length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

export const POLICY_KEYS = Object.keys(CONFIG_DEFAULTS) as PolicyKey[];

/** The env vars whose value differs between two policies. */
export function changedKeys(base: Policy, draft: Policy): PolicyKey[] {
  return POLICY_KEYS.filter((k) => !same(base[k], draft[k]));
}

/** Only the keys that differ from `base`, as a partial policy. */
export function diff(base: Policy, draft: Policy): Partial<Policy> {
  return Object.fromEntries(changedKeys(base, draft).map((k) => [k, draft[k]])) as Partial<Policy>;
}

export function weightSum(w: Weights): number {
  return Math.round(SEVERITY_INPUTS.reduce((a, k) => a + (w[k] ?? 0), 0) * 1e6) / 1e6;
}

export interface PolicyIssue {
  key: PolicyKey;
  message: string;
}

export function validate(p: Policy): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const sum = weightSum(p.SEVERITY_WEIGHTS);
  if (Math.abs(sum - 1) > EPS) issues.push({ key: "SEVERITY_WEIGHTS", message: `Weights must sum to 1.00 (now ${sum.toFixed(2)}).` });
  if (SEVERITY_INPUTS.some((k) => p.SEVERITY_WEIGHTS[k] < 0 || p.SEVERITY_WEIGHTS[k] > 1))
    issues.push({ key: "SEVERITY_WEIGHTS", message: "Each weight must be between 0 and 1." });
  const t = p.SEVERITY_BANDS;
  if (!(t.low > 0 && t.low < t.medium && t.medium < t.high && t.high < t.critical && t.critical <= 1))
    issues.push({ key: "SEVERITY_BANDS", message: "Band thresholds must rise strictly: low < medium < high < critical." });
  if (p.PROOF_MIN_SCORE < 0 || p.PROOF_MIN_SCORE > 1) issues.push({ key: "PROOF_MIN_SCORE", message: "The proof threshold is a score between 0 and 1." });
  if (!Number.isInteger(p.PROOF_MAX_PER_RUN) || p.PROOF_MAX_PER_RUN < 0) issues.push({ key: "PROOF_MAX_PER_RUN", message: "Proofs per run must be a whole number." });
  if (p.PROOF_TIMEOUT <= 0 || p.DEP_INSTALL_TIMEOUT <= 0) issues.push({ key: "PROOF_TIMEOUT", message: "Timeouts must be positive." });
  return issues;
}

const num = (x: number) => String(Math.round(x * 1000) / 1000);

/** `.env` lines for the given keys, in the exact form config.py parses. */
export function envLines(p: Policy, keys: PolicyKey[] = POLICY_KEYS): string[] {
  return keys.map((k) => {
    const v = p[k];
    if (k === "SEVERITY_WEIGHTS") {
      const w = v as Weights;
      return `${k}=${JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((i) => [i, Number(num(w[i as SeverityInput]))])))}`;
    }
    if (k === "SEVERITY_BANDS") {
      const t = v as Thresholds;
      return `${k}=${JSON.stringify({ critical: Number(num(t.critical)), high: Number(num(t.high)), medium: Number(num(t.medium)), low: Number(num(t.low)) })}`;
    }
    if (typeof v === "boolean") return `${k}=${v ? "true" : "false"}`;
    if (typeof v === "number") return `${k}=${num(v)}`;
    return `${k}=${String(v)}`;
  });
}

/* ---------------------------------------------------------------------------
   Scoring, exactly as core/severity.py does it
   --------------------------------------------------------------------------- */

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export function scoreUnder(inputs: Partial<Record<string, number>>, weights: Weights): number {
  const raw = SEVERITY_INPUTS.reduce((a, k) => a + (weights[k] ?? 0) * clamp01(inputs[k] ?? 0), 0);
  return Math.round(raw * 1000) / 1000;
}

export function bandUnder(score: number, t: Thresholds): SeverityBand {
  if (score >= t.critical) return "critical";
  if (score >= t.high) return "high";
  if (score >= t.medium) return "medium";
  if (score >= t.low) return "low";
  return "info";
}

export const bandRank = (b: SeverityBand) => BAND_ORDER.indexOf(b);

/** The band a finding would block at under `p`, or null if it would not block. */
export function blockingBand(f: Finding, p: Policy): SeverityBand | null {
  if (f.status !== "published" || f.proof?.status !== "proven") return null;
  if ((f.location?.language ?? "").trim().toLowerCase() !== "python") return null;
  if (!f.severity?.inputs) return null;
  const band = bandUnder(scoreUnder(f.severity.inputs as Record<string, number>, p.SEVERITY_WEIGHTS), p.SEVERITY_BANDS);
  return bandRank(band) >= bandRank(p.BLOCK_MIN_SEVERITY) ? band : null;
}

export function blocksUnder(f: Finding, p: Policy): boolean {
  return blockingBand(f, p) !== null;
}

export interface GateImpact {
  findings: number;
  runs: number;
  byBand: Record<SeverityBand, number>;
}

export function gateImpact(findings: readonly Finding[], p: Policy): GateImpact {
  const byBand = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<SeverityBand, number>;
  const runs = new Set<string>();
  let n = 0;
  for (const f of findings) {
    const band = blockingBand(f, p);
    if (!band) continue;
    n += 1;
    byBand[band] += 1;
    runs.add(f.review_id);
  }
  return { findings: n, runs: runs.size, byBand };
}

/** 0.25 → "0.25"; a weight that genuinely needs three decimals keeps them (0.417). */
export function formatWeight(x: number): string {
  const two = x.toFixed(2);
  return Math.abs(Number(two) - x) < 1e-9 ? two : x.toFixed(3);
}

/* ---------------------------------------------------------------------------
   The draft survives a reload: sessionStorage, validated on the way back in
   so a stale or hand-edited entry can never inject a malformed policy.
   --------------------------------------------------------------------------- */

export const DRAFT_STORAGE_KEY = "witness:policy-draft";

const BANDS = ["info", "low", "medium", "high", "critical"];
const MODES = ["auto", "post", "dry_run"];

function validValue(k: PolicyKey, v: unknown): boolean {
  const d = CONFIG_DEFAULTS[k];
  if (k === "BLOCK_MIN_SEVERITY") return typeof v === "string" && BANDS.includes(v);
  if (k === "GITHUB_DELIVERY_MODE") return typeof v === "string" && MODES.includes(v);
  if (typeof d === "boolean") return typeof v === "boolean";
  if (typeof d === "number") return typeof v === "number" && Number.isFinite(v);
  if (d && typeof d === "object") {
    if (!v || typeof v !== "object") return false;
    const want = Object.keys(d);
    const got = v as Record<string, unknown>;
    return want.every((key) => typeof got[key] === "number" && Number.isFinite(got[key] as number)) && Object.keys(got).length === want.length;
  }
  return false;
}

/** Keeps only known keys whose values have the right shape. */
export function sanitizeDraft(input: unknown): Partial<Policy> {
  if (!input || typeof input !== "object") return {};
  const out: Partial<Policy> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if ((POLICY_KEYS as string[]).includes(k) && validValue(k as PolicyKey, v)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface StoredDraft {
  saved: Partial<Policy>;
  pending: Partial<Policy>;
}

export function readStoredDraft(storage: Pick<Storage, "getItem"> | null): StoredDraft {
  try {
    const raw = storage?.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return { saved: {}, pending: {} };
    const parsed = JSON.parse(raw) as { saved?: unknown; pending?: unknown };
    return { saved: sanitizeDraft(parsed.saved), pending: sanitizeDraft(parsed.pending) };
  } catch {
    return { saved: {}, pending: {} };
  }
}

export function writeStoredDraft(storage: Pick<Storage, "setItem" | "removeItem"> | null, draft: StoredDraft): void {
  try {
    if (!Object.keys(draft.saved).length && !Object.keys(draft.pending).length) storage?.removeItem(DRAFT_STORAGE_KEY);
    else storage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* storage blocked or full: the draft still lives for this render tree */
  }
}
