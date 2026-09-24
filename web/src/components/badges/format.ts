// OWNER: t1c (wave 1). Pure logic behind the semantic chips — no React, no DOM.
import { SEVERITY_THRESHOLDS, type SeverityBand } from "@/lib/contracts";

/** The five bands, lowest first. A band's position here + 1 is its rank. */
export const SEVERITY_BANDS = ["info", "low", "medium", "high", "critical"] as const satisfies readonly SeverityBand[];

export type BandRank = 1 | 2 | 3 | 4 | 5;

/** 1 (info) … 5 (critical): the number of filled segments in the severity meter. */
export function bandRank(band: SeverityBand): BandRank {
  return (SEVERITY_BANDS.indexOf(band) + 1) as BandRank;
}

/**
 * The band a score falls in, using the frozen thresholds (≥ .15 low, ≥ .35 medium,
 * ≥ .55 high, ≥ .75 critical). The API sends the band; this exists for specimens and for
 * checking the two agree — the component always draws the band it is given.
 */
export function bandForScore(score: number): SeverityBand {
  if (score >= SEVERITY_THRESHOLDS.critical) return "critical";
  if (score >= SEVERITY_THRESHOLDS.high) return "high";
  if (score >= SEVERITY_THRESHOLDS.medium) return "medium";
  if (score >= SEVERITY_THRESHOLDS.low) return "low";
  return "info";
}

/** Printed when a score is missing or not a number: a dash, never an invented 0.000. */
export const NO_SCORE = "—";

/**
 * A score, weight, contribution or rate to exactly 3 decimals — `0.810`, never `0.81`
 * (brand-gaps §D numeric style). The value is printed as received, not clamped: a score
 * outside 0..1 is a backend defect and should look like one.
 */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return NO_SCORE;
  const text = score.toFixed(3);
  return text === "-0.000" ? "0.000" : text;
}

/** The band letter the compact meter prints beside its segments. */
export const BAND_LETTER: Record<SeverityBand, string> = { info: "I", low: "L", medium: "M", high: "H", critical: "C" };

/**
 * brand-gaps §D: in a UI chip a state is its value in 11px mono caps. `not_attempted` →
 * `NOT ATTEMPTED`. (In a log line or API path it stays `proof_status: not_attempted`.)
 */
export function chipLabel(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}
