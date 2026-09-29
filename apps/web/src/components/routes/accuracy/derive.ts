// Pure derivations behind /accuracy: every sentence the page writes about the
// numbers is computed here from the report and series, so the copy can never
// drift from the data (and is unit-tested against the fixture corpus).
// Rates recover their integer counts with successesFromRate (exact for
// backend rates rounded to 3 decimals) and get a Wilson 95% interval.
import { successesFromRate, wilson, type WilsonInterval } from "@/components/charts/wilson";
import type { AccuracySeriesExt } from "@/components/charts";
import type { AccuracyMetric, AccuracyReport } from "@/lib/api-types";

export interface Proxy {
  value: number | null;
  n: number;
  /** The integer count behind the rate (value × n). */
  k: number;
  ci: WilsonInterval | null;
  definition: string;
}

export function proxy(metric: AccuracyMetric | undefined): Proxy {
  const n = metric?.n ?? 0;
  const value = metric?.value ?? null;
  const k = value == null ? 0 : successesFromRate(value, n);
  return { value, n, k, ci: value == null || n <= 0 ? null : wilson(k, n), definition: metric?.definition ?? "" };
}

/** `0.119` — the rate as the backend rounds it (3 decimals), or an em dash for "no data". */
export function ratio(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : value.toFixed(3);
}

export function percent(value: number | null | undefined, digits = 0): string {
  return value == null || Number.isNaN(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}

export function ciText(p: Proxy): string {
  if (!p.ci) return `n = ${p.n} · no interval`;
  return `n = ${p.n} · 95% CI ${ratio(p.ci.low)}–${ratio(p.ci.high)}`;
}

/** The page headline: counts, never adjectives. */
export function headline(report: AccuracyReport): { title: string; soft: string } {
  const attempted = report.proof.attempted ?? 0;
  const proven = report.proof.proven ?? 0;
  const refuted = report.proof.disproven ?? 0;
  if (attempted === 0) return { title: "Nothing proven in this window.", soft: "No proof was attempted." };
  const title = `${proven} ${proven === 1 ? "bug" : "bugs"} proven by execution,`;
  const soft = refuted === 0 ? "none of its own claims refuted." : `and ${refuted} of its own ${refuted === 1 ? "claim" : "claims"} refuted first.`;
  return { title, soft };
}

/** The whole-window proof keys, in the kit's stack order (colours live in PROOF_ENCODING). */
export type ProofKey = "proven" | "disproven" | "inconclusive" | "skipped_no_env" | "not_attempted" | "not_applicable";

/** Plain-type interval text: "95% interval 0.096–0.233". */
export function intervalText(p: Proxy): string {
  return p.ci ? `95% interval ${ratio(p.ci.low)}–${ratio(p.ci.high)}` : "No interval without data";
}

/* ---------------------------------------------------------------------------
   Window presets: whole UTC days back from "now" (the frozen corpus instant in
   fixture mode), with `until` left open.
   --------------------------------------------------------------------------- */

export const WINDOW_PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
] as const;

export type PresetId = "all" | (typeof WINDOW_PRESETS)[number]["id"] | "custom";

/** UTC midnight `days` days before `now`'s calendar date. */
export function daysBefore(now: number, days: number): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - days));
}

export function activePreset(since: Date | null, until: Date | null, now: number): PresetId {
  if (!since && !until) return "all";
  if (since && !until) {
    const hit = WINDOW_PRESETS.find((p) => daysBefore(now, p.days).getTime() === since.getTime());
    if (hit) return hit.id;
  }
  return "custom";
}

export interface CalibrationPoint {
  band: string;
  mean: number;
  addressed: number;
  n: number;
  published: number;
  rate: number;
  ci: WilsonInterval;
}

export function calibrationPoints(series: AccuracySeriesExt): { points: CalibrationPoint[]; empty: string[] } {
  const points: CalibrationPoint[] = [];
  const empty: string[] = [];
  for (const row of series.calibration) {
    const mean = row.predicted_score_mean as number | null;
    if (!row.n || mean == null) {
      empty.push(row.band);
      continue;
    }
    points.push({
      band: row.band,
      mean,
      addressed: row.addressed,
      n: row.n,
      published: row.published_n,
      rate: row.addressed / row.n,
      ci: wilson(row.addressed, row.n),
    });
  }
  return { points, empty };
}

/** The plain-language reading of the calibration chart. */
export function calibrationReading(points: CalibrationPoint[]): string[] {
  if (points.length === 0) return ["No band has a finding that ran twice yet, so there is nothing to calibrate against."];
  const pool = (bands: string[]) => {
    const rows = points.filter((p) => bands.includes(p.band));
    const a = rows.reduce((s, p) => s + p.addressed, 0);
    const n = rows.reduce((s, p) => s + p.n, 0);
    return { a, n, rate: n ? a / n : null };
  };
  const hi = pool(["critical", "high"]);
  const lo = pool(["medium", "low", "info"]);
  const out: string[] = [];
  if (hi.n && lo.n && hi.rate != null && lo.rate != null) {
    const verdict = hi.rate > lo.rate ? "Higher severity was fixed more often." : "Severity did not predict a fix in this window.";
    out.push(
      `${verdict} Critical and high: ${hi.a} of ${hi.n} addressed (${percent(hi.rate)}). Medium and low: ${lo.a} of ${lo.n} (${percent(lo.rate)}).`,
    );
  }
  const maxN = Math.max(...points.map((p) => p.n));
  if (maxN < 30) out.push(`No band has more than ${maxN} findings, so the intervals are wide. Read the direction, not the decimals.`);
  return out;
}

export interface DismissalRow {
  category: string;
  dismissed: number;
  published: number;
  rate: number;
  ci: WilsonInterval;
}

export function dismissalRows(series: AccuracySeriesExt): DismissalRow[] {
  return series.dismissal_by_category
    .filter((r) => r.published > 0)
    .map((r) => ({ ...r, rate: r.dismissed / r.published, ci: wilson(r.dismissed, r.published) }))
    .sort((a, b) => b.rate - a.rate || b.published - a.published);
}

/** Median review time the way the landing prints it: 28.7s, never rounded to 29s. */
export function duration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  if (sec < 90) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.round(sec - m * 60)}s`;
}

/** Round up to a clean axis maximum with at most 4 steps. */
export function niceScale(max: number): { max: number; step: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const m = Math.max(1, max);
  const step = steps.find((s) => m / s <= 4) ?? Math.pow(10, Math.ceil(Math.log10(m / 4)));
  return { max: Math.ceil(m / step) * step, step };
}
