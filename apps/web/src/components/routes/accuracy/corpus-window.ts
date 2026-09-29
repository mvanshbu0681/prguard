// The accuracy self-report for any since/until window, recomputed client-side
// from the fixture corpus (fixture mode only: the fixture resolver serves one
// all-time report). It follows apps/api core/accuracy.py exactly:
//   · the window selects review runs by created_at (since <= created_at <= until);
//     every finding, outcome and audit event is read through those runs;
//   · rates are round(num / den, 3), and null when the denominator is 0;
//   · human_dismissal_rate divides by findings that were EVER published (a
//     finding.published audit event), and a dismissal is an ever-published
//     finding that is now suppressed ("an explicit suppression is counted as
//     dismissed");
//   · addressed_rate divides by published findings on PRs run more than once
//     inside the window; a finding is addressed when its fingerprint is gone
//     from a later successful run of the same PR (outcome rows are global, so
//     "later" is not limited to the window, as in the backend).
// With no window it reproduces accuracy/report.json and series.json exactly
// (corpus-window.test.ts), which is what makes the windowed numbers citable.
import type { AccuracySeriesExt } from "@/components/charts";
import type { AccuracyReport } from "@/lib/api-types";

export interface CorpusRun {
  id: string;
  created_at: string;
  status: string;
  gate: string | null;
  duration: number | null;
  /** `owner/name#number` */
  pr: string;
}

export interface CorpusFinding {
  id: string;
  run: string;
  status: string;
  proof: string;
  category: string;
  fingerprint: string | null;
  score: number | null;
  band: string | null;
  /** Has a finding.published audit event. */
  everPublished: boolean;
}

export interface AccuracyCorpus {
  runs: CorpusRun[];
  findings: CorpusFinding[];
  /** review_id of every override.break_glass audit event. */
  breakGlassRuns: string[];
  /** Definitions and caveats, verbatim from the all-time report. */
  definitions: Record<"execution_verified_precision" | "self_caught_false_positive_rate" | "human_dismissal_rate" | "addressed_rate", string>;
  caveats: string[];
}

const ATTEMPTED = ["proven", "disproven", "inconclusive", "skipped_no_env"] as const;
const BANDS_DESC = ["critical", "high", "medium", "low", "info"] as const;
const CATEGORIES = ["correctness", "security", "test_integrity", "performance", "maintainability"] as const;

/**
 * Python's round(x, 3): the exact binary value, halves to even. `toFixed` already
 * rounds the exact value (0.7925 is really 0.79249999… → 0.792); only a true,
 * exactly representable tie (0.0625) needs the half-to-even correction.
 */
export function round3(x: number): number {
  if (!Number.isFinite(x)) return x;
  const exact = Math.abs(x).toFixed(20);
  const [, frac = ""] = exact.split(".");
  if (frac[3] === "5" && /^0*$/.test(frac.slice(4))) {
    const down = Math.trunc(Math.abs(x) * 1000);
    const even = down % 2 === 0 ? down : down + 1;
    return (Math.sign(x) * even) / 1000;
  }
  return Number(x.toFixed(3));
}

/** math.fsum-grade summation (Neumaier), as statistics.fmean uses. */
function fsum(xs: number[]): number {
  let sum = 0;
  let c = 0;
  for (const x of xs) {
    const t = sum + x;
    c += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
    sum = t;
  }
  return sum + c;
}
const ratio = (num: number, den: number) => (den > 0 ? round3(num / den) : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return round3(a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2);
}

/** Monday of the UTC week, as `YYYY-MM-DD` (Python's date.weekday()). */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const back = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

function count<T>(xs: readonly T[], pred: (x: T) => boolean): number {
  let n = 0;
  for (const x of xs) if (pred(x)) n += 1;
  return n;
}

/** Outcome sets are global (every run, not just the window), as the backend's finding_outcomes rows are. */
function outcomes(corpus: AccuracyCorpus) {
  const runById = new Map(corpus.runs.map((r) => [r.id, r]));
  const byRun = new Map<string, CorpusFinding[]>();
  for (const f of corpus.findings) byRun.set(f.run, [...(byRun.get(f.run) ?? []), f]);
  const dismissed = new Set(corpus.findings.filter((f) => f.everPublished && f.status === "suppressed").map((f) => f.id));
  const addressed = new Set<string>();
  for (const f of corpus.findings) {
    if (f.status !== "published" || !f.fingerprint) continue;
    const run = runById.get(f.run);
    if (!run) continue;
    const later = corpus.runs.filter((r) => r.pr === run.pr && r.status === "succeeded" && r.created_at > run.created_at);
    if (later.some((r) => !(byRun.get(r.id) ?? []).some((g) => g.fingerprint === f.fingerprint))) addressed.add(f.id);
  }
  return { dismissed, addressed };
}

export function windowedAccuracy(
  corpus: AccuracyCorpus,
  since: string | null,
  until: string | null,
): { report: AccuracyReport; series: AccuracySeriesExt } {
  // ISO strings compare lexically only at equal precision; compare as instants.
  const t = (iso: string | null) => (iso ? Date.parse(iso) : null);
  const s = t(since);
  const u = t(until);
  const runs = corpus.runs.filter((r) => {
    const c = Date.parse(r.created_at);
    return (s == null || c >= s) && (u == null || c <= u);
  });
  const runIds = new Set(runs.map((r) => r.id));
  const rows = corpus.findings.filter((f) => runIds.has(f.run));
  const { dismissed, addressed } = outcomes(corpus);

  const findings = {
    proposed: rows.length,
    published: count(rows, (f) => f.status === "published"),
    suppressed: count(rows, (f) => f.status === "suppressed"),
    dropped_by_coordinator: count(rows, (f) => f.status === "dropped"),
    per_review_published_mean: runs.length ? round3(count(rows, (f) => f.status === "published") / runs.length) : 0,
  };

  const proofCount = (k: string) => count(rows, (f) => f.proof === k);
  const attempted = count(rows, (f) => (ATTEMPTED as readonly string[]).includes(f.proof));
  const proof = {
    attempted,
    proven: proofCount("proven"),
    disproven: proofCount("disproven"),
    inconclusive: proofCount("inconclusive"),
    skipped_no_env: proofCount("skipped_no_env"),
    proven_rate: ratio(proofCount("proven"), attempted),
    disproven_rate: ratio(proofCount("disproven"), attempted),
  };

  const executed = rows.filter((f) => f.status === "published" && (f.proof === "proven" || f.proof === "disproven"));
  const ever = rows.filter((f) => f.status === "published" || dismissed.has(f.id));
  const runsPerPr = new Map<string, number>();
  for (const r of runs) runsPerPr.set(r.pr, (runsPerPr.get(r.pr) ?? 0) + 1);
  const runPr = new Map(runs.map((r) => [r.id, r.pr]));
  const addressable = rows.filter((f) => f.status === "published" && (runsPerPr.get(runPr.get(f.run) ?? "") ?? 0) > 1);

  const d = corpus.definitions;
  const metric = (num: number, den: number, definition: string) => ({ value: ratio(num, den), n: den, definition });

  const report: AccuracyReport = {
    window: { since, until, repository: null },
    runs: {
      total: runs.length,
      succeeded: count(runs, (r) => r.status === "succeeded"),
      failed: count(runs, (r) => r.status === "failed"),
      cancelled: count(runs, (r) => r.status === "cancelled"),
      median_duration_seconds: median(runs.flatMap((r) => (r.duration == null ? [] : [r.duration]))),
    },
    findings,
    proof,
    precision_proxies: {
      execution_verified_precision: metric(count(executed, (f) => f.proof === "proven"), executed.length, d.execution_verified_precision),
      self_caught_false_positive_rate: metric(proof.disproven, attempted, d.self_caught_false_positive_rate),
      human_dismissal_rate: metric(count(ever, (f) => dismissed.has(f.id)), ever.length, d.human_dismissal_rate),
      addressed_rate: metric(count(addressable, (f) => addressed.has(f.id)), addressable.length, d.addressed_rate),
    },
    gate: {
      runs_red: count(runs, (r) => r.gate === "failure"),
      runs_green: count(runs, (r) => r.gate === "success"),
      runs_neutral: count(runs, (r) => r.gate === "neutral"),
      break_glass_overrides: count(corpus.breakGlassRuns, (id) => runIds.has(id)),
    },
    caveats: corpus.caveats,
  };

  // Weekly composition: every attempted proof, plus every non-dropped finding
  // that was not attempted, by the Monday of its run's week.
  const weeks: string[] = [];
  if (runs.length) {
    const first = runs.reduce((a, r) => (Date.parse(r.created_at) < Date.parse(a) ? r.created_at : a), runs[0].created_at);
    const last = runs.reduce((a, r) => (Date.parse(r.created_at) > Date.parse(a) ? r.created_at : a), runs[0].created_at);
    for (let w = weekStart(first); w <= weekStart(last); ) {
      weeks.push(w);
      const next = new Date(`${w}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      w = next.toISOString().slice(0, 10);
    }
  }
  const runWeek = new Map(runs.map((r) => [r.id, weekStart(r.created_at)]));
  const weekly = weeks.map((week) => {
    const here = rows.filter((f) => runWeek.get(f.run) === week);
    const visible = (k: string) =>
      count(here, (f) => f.proof === k && ((ATTEMPTED as readonly string[]).includes(k) || f.status !== "dropped"));
    return {
      week_start: week,
      proven: visible("proven"),
      disproven: visible("disproven"),
      inconclusive: visible("inconclusive"),
      skipped_no_env: visible("skipped_no_env"),
      not_attempted: visible("not_attempted"),
      not_applicable: visible("not_applicable"),
    };
  });

  const series: AccuracySeriesExt = {
    weekly,
    dismissal_by_category: CATEGORIES.map((category) => {
      const population = ever.filter((f) => f.category === category);
      return { category, dismissed: count(population, (f) => dismissed.has(f.id)), published: population.length };
    }),
    calibration: BANDS_DESC.map((band) => {
      const population = addressable.filter((f) => f.band === band);
      const scores = population.flatMap((f) => (f.score == null ? [] : [f.score]));
      return {
        band,
        predicted_score_mean: (scores.length ? round3(fsum(scores) / scores.length) : null) as number,
        addressed: count(population, (f) => addressed.has(f.id)),
        n: population.length,
        published_n: count(ever, (f) => f.band === band),
      };
    }),
    raw_counts: {},
  };

  return { report, series };
}

/* ---------------------------------------------------------------------------
   Building the compact corpus from the fixture files (server-side in page.tsx,
   directly from JSON in tests). Only the fields the report needs cross to the
   client: ~76 runs and ~250 findings.
   --------------------------------------------------------------------------- */

interface ReviewLike {
  review_id: string;
  created_at: string;
  status: string;
  gate_conclusion?: string | null;
  duration_seconds?: number | null;
  repository: { owner: string; name: string };
  pull_request: { number: number };
}

interface FindingLike {
  id: string;
  review_id: string;
  status: string;
  category: string;
  fingerprint?: string | null;
  proof?: { status?: string | null } | null;
  severity?: { score?: number | null; band?: string | null } | null;
}

interface AuditLike {
  event_type: string;
  finding_id?: string | null;
  review_id?: string | null;
}

export function corpusFromFixtures(input: {
  reviews: readonly ReviewLike[];
  findings: readonly FindingLike[];
  audit: readonly AuditLike[];
  report: AccuracyReport;
}): AccuracyCorpus {
  const published = new Set(input.audit.filter((e) => e.event_type === "finding.published" && e.finding_id).map((e) => e.finding_id as string));
  const pp = input.report.precision_proxies;
  return {
    runs: input.reviews.map((r) => ({
      id: r.review_id,
      created_at: r.created_at,
      status: r.status,
      gate: r.gate_conclusion ?? null,
      duration: r.duration_seconds ?? null,
      pr: `${r.repository.owner}/${r.repository.name}#${r.pull_request.number}`,
    })),
    findings: input.findings.map((f) => ({
      id: f.id,
      run: f.review_id,
      status: f.status,
      proof: f.proof?.status ?? "not_attempted",
      category: f.category,
      fingerprint: f.fingerprint ?? null,
      score: f.severity?.score ?? null,
      band: f.severity?.band ?? null,
      everPublished: published.has(f.id),
    })),
    breakGlassRuns: input.audit.filter((e) => e.event_type === "override.break_glass" && e.review_id).map((e) => e.review_id as string),
    definitions: {
      execution_verified_precision: pp.execution_verified_precision.definition,
      self_caught_false_positive_rate: pp.self_caught_false_positive_rate.definition,
      human_dismissal_rate: pp.human_dismissal_rate.definition,
      addressed_rate: pp.addressed_rate.definition,
    },
    caveats: input.report.caveats,
  };
}
