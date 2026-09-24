// OWNER: t10 (wave 2). Local types for the chart layer.
//
// Two extensions of frozen wave-1 files, per plan §8 ("a wave-2 builder blocked
// on a missing field adds it to their own local type and files it — they do not
// edit the frozen file"), both reported under 'raised':
//
// 1. `AccuracySeriesExt` widens `src/lib/fixture-types.ts`'s `AccuracySeries`.
//    That interface's `weekly` row type is missing `skipped_no_env` and
//    `not_applicable`. The file on disk (web/public/fixtures/accuracy/series.json)
//    and its own README both carry all six keys, and A6/the dashboard
//    blueprint's proof-state composition chart needs all six bands. `getAccuracySeries()`
//    is typed as the narrower `AccuracySeries`; every consumer in this folder
//    casts through `asAccuracySeriesExt` at the one boundary where the fixture
//    enters the chart layer, rather than trusting `as` scattered through the code.
//
// 2. `AccuracyMetricLike` is the shape `<MetricCard>` renders — the same fields
//    as the generated `AccuracyMetric` (value, n, definition), but not a nominal
//    dependency on it, because two of the six A6 metrics (`proven_rate`,
//    `inconclusive_rate`) are not `AccuracyMetric` objects in `AccuracyReport`:
//    `proven_rate` lives on `AccuracyProof` with no `n`/`definition` of its own,
//    and `inconclusive_rate` does not exist in the API payload at all (A6: it is
//    derived client-side as `proof.inconclusive / proof.attempted`). `<MetricGrid>`
//    builds an `AccuracyMetricLike` for those two from `report.proof` plus a
//    written definition string; the other four are `report.precision_proxies[key]`
//    unchanged.
import type { AccuracySeries } from "@/lib/api-types";

/** The four proof-state keys `AccuracySeries` already types, unchanged. */
export type AccuracySeriesWeeklyKnown = AccuracySeries["weekly"][number];

/** A weekly composition row with the two keys the frozen type is missing. */
export interface AccuracySeriesWeeklyRow extends AccuracySeriesWeeklyKnown {
  skipped_no_env: number;
  not_applicable: number;
}

export interface AccuracySeriesExt extends Omit<AccuracySeries, "weekly"> {
  weekly: AccuracySeriesWeeklyRow[];
}

/**
 * Narrows/widens a resolver- or fixture-sourced `AccuracySeries` to the shape
 * this folder's charts need. Throws loudly (rather than silently rendering
 * `undefined` as 0) if a row is still missing a key — that means the gap this
 * comment describes has been closed upstream and this cast should be deleted.
 */
export function asAccuracySeriesExt(series: AccuracySeries): AccuracySeriesExt {
  for (const row of series.weekly) {
    const widened = row as Partial<AccuracySeriesWeeklyRow>;
    if (typeof widened.skipped_no_env !== "number" || typeof widened.not_applicable !== "number") {
      throw new TypeError(
        `accuracy/series.json weekly row for ${row.week_start} is missing skipped_no_env/not_applicable — ` +
          "AccuracySeries (src/lib/fixture-types.ts) needs widening, or the generator regressed. See charts/types.ts.",
      );
    }
  }
  return series as AccuracySeriesExt;
}

/** What `<MetricCard>` needs to render one of the six A6 metrics — see file header. */
export interface AccuracyMetricLike {
  /** null → "no data (n = 0)", never an invented 0.000. */
  value: number | null;
  n?: number;
  /** Always-visible 13px body text — never a tooltip (dashboard §2.10). */
  definition: string;
}
