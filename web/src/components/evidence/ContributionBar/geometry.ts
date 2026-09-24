// OWNER: t5 (wave 2). Pure arithmetic behind <ContributionBar> — no React, no DOM.
//
// The whole product claim for this component ("severity is arithmetic, check it by
// eye") lives here: six contributions in the fixed SEVERITY_INPUTS order, their
// widths on the track, which threshold tick the score has crossed, and which clause
// of the generated sentence belongs to which input. Every function is deterministic
// and side-effect free so `tests/unit/evidence/contribution-bar/geometry.test.ts` can
// property-test it directly (dashboard blueprint §3a; plan A13 for the demo numbers).
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS, type SeverityBand } from "@/lib/contracts";

export type SeverityInputName = (typeof SEVERITY_INPUTS)[number];
export type SeverityValues = Record<SeverityInputName, number>;

export interface ContributionRow {
  name: SeverityInputName;
  /** Clamped to [0, 1] — a caller handing over an out-of-range input has a bug (severity.py `_clamp`). */
  raw: number;
  weight: number;
  /** raw × weight, in score units (0..1). */
  contribution: number;
}

/**
 * `FindingSeverity.weights` comes off the wire typed as `{ [key: string]: number }`
 * (the generated client cannot know it always carries exactly the six
 * SEVERITY_INPUTS keys) — that index-signature shape is not structurally
 * assignable to `SeverityValues`'s six named keys, so a caller reading real API
 * or fixture data needs this adapter rather than an `as` cast at every call site.
 * Missing keys default to 0 — a weights object short a key is a backend defect
 * the caller should already be catching, not something to hide.
 */
export function toSeverityValues(record: Record<string, number>): SeverityValues {
  return Object.fromEntries(SEVERITY_INPUTS.map((name) => [name, record[name] ?? 0])) as SeverityValues;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * The six rows, in SEVERITY_INPUTS' fixed, canonical, never-reordered order
 * (weight descending, ties by declaration order) — never sorted by value or
 * contribution. This is what makes the 64px glyph comparable across rows.
 */
export function contributionRows(inputs: SeverityValues, weights: SeverityValues): ContributionRow[] {
  return SEVERITY_INPUTS.map((name) => {
    const raw = clamp01(inputs[name]);
    const weight = Number.isFinite(weights[name]) ? weights[name] : 0;
    return { name, raw, weight, contribution: raw * weight };
  });
}

/** Σ of the six contributions — must equal `severity.score` within 0.0005 (SCORE_PRECISION headroom). */
export function sumContributions(rows: readonly ContributionRow[]): number {
  return rows.reduce((total, row) => total + row.contribution, 0);
}

/** Segment widths never collapse below this, so a near-zero input stays locatable (§3a). */
export const SEGMENT_MIN_PX = 3;

/**
 * Each row's width as a fraction of the track's own length: `contribution × trackWidth`
 * expressed as a percentage (0..100), so the caller never has to know the track's
 * actual resolved pixel width — the CSS applies `max(pct%, 3px)` itself. Kept
 * separately from the on-screen floor so the sum-to-score property (tested below)
 * checks the un-floored arithmetic, which is the thing that must never drift.
 */
export function contributionPercent(row: Pick<ContributionRow, "contribution">): number {
  return row.contribution * 100;
}

/** The un-floored pixel width at a given track width — for the property test only; the DOM uses percentages. */
export function rawSegmentWidthPx(row: Pick<ContributionRow, "contribution">, trackWidthPx: number): number {
  return row.contribution * trackWidthPx;
}

/** `rawSegmentWidthPx`, floored at `minPx` — what a fixed-width (non-responsive) rendering would show. */
export function flooredSegmentWidthPx(row: Pick<ContributionRow, "contribution">, trackWidthPx: number, minPx: number = SEGMENT_MIN_PX): number {
  return Math.max(rawSegmentWidthPx(row, trackWidthPx), minPx);
}

/** The four fixed tick thresholds, ascending — the same order they are drawn on the axis. */
export const TICKS = ["low", "medium", "high", "critical"] as const satisfies readonly (keyof typeof SEVERITY_THRESHOLDS)[];
export type TickKey = (typeof TICKS)[number];

export const TICK_LABEL: Record<TickKey, string> = { low: "low", medium: "medium", high: "high", critical: "critical" };

/**
 * The highest tick the score has reached, or `null` below the first tick (`.15`).
 * That tick — and only that tick — is promoted to 2px in the band colour (§3a):
 * "the move that answers 'why critical and not high?' in one glance with no legend."
 */
export function promotedTick(score: number): TickKey | null {
  for (let i = TICKS.length - 1; i >= 0; i--) {
    const key = TICKS[i];
    if (score >= SEVERITY_THRESHOLDS[key]) return key;
  }
  return null;
}

/** The band a score falls in, mirroring `bandForScore` (@/components/badges) without importing React-adjacent code here. */
export function bandForScore(score: number): SeverityBand {
  const tick = promotedTick(score);
  return tick ?? "info";
}

/**
 * The band's own printed rule, e.g. `≥ 0.750 → critical` (the Σ row) or
 * `< 0.150 → info` when no tick is crossed. Numeric style: 3 decimals, always
 * (brand-gaps §D) — the worked examples' `.75` shorthand is not the display format.
 */
export function bandRuleText(band: SeverityBand): string {
  if (band === "info") return `< ${SEVERITY_THRESHOLDS.low.toFixed(3)} → info`;
  return `≥ ${SEVERITY_THRESHOLDS[band].toFixed(3)} → ${band}`;
}

// ---------------------------------------------------------------------------
// Explanation clauses — matching severity.py's `explain()` / `_phrase()` so a
// segment's hover/focus can underline the clause it produced (read from the
// backend reference at scratchpad/backend-ref/src/prguard/core/severity.py).
// ---------------------------------------------------------------------------

/**
 * Mirrors `_phrase(name, value)` in severity.py exactly (same thresholds, same
 * `.2f` formatting), so a clause's TEXT — not its position — identifies which
 * input produced it. `explain()` orders clauses by contribution descending
 * (not SEVERITY_INPUTS' fixed order) and joins them with " × ", omitting any
 * input whose measured value is 0.
 */
export function phraseFor(name: SeverityInputName, value: number): string {
  switch (name) {
    case "reachability":
      return value >= 1 ? "reachable from a public entrypoint" : "reachable internally";
    case "blast_radius":
      return `blast radius ${value.toFixed(2)}`;
    case "path_sensitivity":
      return value >= 1 ? "sensitive path" : "infrastructure path";
    case "coverage_gap":
      return value >= 1 ? "untested" : "file tested, symbol not";
    case "churn":
      return `churn ${value.toFixed(2)}`;
    case "proof_confidence":
      return value >= 1 ? "proven" : "unproven";
  }
}

export interface ExplanationClause {
  text: string;
  /** null when no row's computed phrase matches this clause (e.g. an explanation from a future backend build). */
  input: SeverityInputName | null;
}

/**
 * Splits `explanation` on " × " (severity.py's own join) and matches each clause
 * back to the input whose `phraseFor` produced identical text, so the pull-quote
 * can underline the clause a hovered/focused segment corresponds to.
 */
export function explanationClauses(explanation: string | undefined, rows: readonly ContributionRow[]): ExplanationClause[] {
  if (!explanation) return [];
  const phraseToInput = new Map<string, SeverityInputName>();
  for (const row of rows) {
    if (row.contribution > 0) phraseToInput.set(phraseFor(row.name, row.raw), row.name);
  }
  return explanation.split(" × ").map((text) => ({ text, input: phraseToInput.get(text) ?? null }));
}

// ---------------------------------------------------------------------------
// Entrance timing — the 420ms total budget (brand-gaps §2 ruling 4 and 7;
// motion spec §4.8.1). Six segments, `STAGGER.sibling` (60ms) apart, each
// growing over the remaining span so the LAST segment finishes at exactly
// `DUR.enter` (420ms): (n − 1) × stagger + perSegmentMs = 420.
// ---------------------------------------------------------------------------

export interface SegmentSchedule {
  /** ms from t=0 this segment starts growing. */
  startMs: number;
  /** ms this segment's own scaleX(0→1) transition runs — the same for all six. */
  durationMs: number;
  /** startMs + durationMs. */
  endMs: number;
}

export function segmentSchedule(count: number, totalMs: number, staggerMs: number): SegmentSchedule[] {
  const perSegmentMs = totalMs - Math.max(0, count - 1) * staggerMs;
  return Array.from({ length: count }, (_, i) => {
    const startMs = i * staggerMs;
    return { startMs, durationMs: perSegmentMs, endMs: startMs + perSegmentMs };
  });
}

/**
 * When the readout should snap: the moment the cumulative filled front (rows in
 * their fixed order, summed left to right) first reaches the promoted tick — i.e.
 * the end of the segment whose growth carries the front across that threshold.
 * Falls back to the entrance's own end when no tick is crossed (the info band)
 * or the schedule is empty, so the readout is never stranded invisible.
 */
export function readoutSnapMs(rows: readonly ContributionRow[], score: number, schedule: readonly SegmentSchedule[]): number {
  const totalMs = schedule.length ? schedule[schedule.length - 1].endMs : 0;
  const tick = promotedTick(score);
  if (tick === null) return totalMs;
  const target = SEVERITY_THRESHOLDS[tick];
  let cumulative = 0;
  for (let i = 0; i < rows.length; i++) {
    cumulative += rows[i].contribution;
    if (cumulative >= target) return schedule[i]?.endMs ?? totalMs;
  }
  return totalMs;
}
