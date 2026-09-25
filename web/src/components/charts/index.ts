// OWNER: t10 (wave 2). The chart layer — dashboard blueprint §7, plan §13 A6/A7.
//
//   wilson(successes, n, z?) -> { low, high }        the Wilson 95% score interval
//   successesFromRate(value, n) -> number            recovers a count from a 3-decimal rate
//
//   <MetricCard name metric provenance derivation? ext? index? />
//       One of the six A6 accuracy metrics. `metric` is an AccuracyMetricLike
//       (value | null, n?, definition) — build one from `AccuracyReport` per
//       metric-grid.tsx, or pass an `AccuracyMetric` straight from
//       `report.precision_proxies`, which already satisfies the shape.
//   <MetricGrid report ext? />
//       All six, in A6's order, plus the disproven_rate footnote and
//       `report.caveats`, always visible.
//
//   <ProofCompositionChart weekly index? provenance? />        100% stacked area, 6 bands
//   <DismissalByCategoryChart categories index? provenance? /> horizontal bars, sorted desc, n on each
//   <CalibrationChart calibration index? provenance? />        scatter + diagonal + Wilson whisker
//   <GateOutcomeBar runsRed runsGreen runsNeutral ext? />       one stacked row, achromatic success
//
// Charts 2-4 read `accuracy/series.json`, which is fixture-only (plan A11):
// every one of them takes plain data props, so a live caller with no series
// data yet passes an empty array/list and gets the shared "not served" empty
// state (chart-frame.tsx) instead of an empty plot.
export { wilson, successesFromRate, type WilsonInterval } from "./wilson";
export {
  asAccuracySeriesExt,
  type AccuracyMetricLike,
  type AccuracySeriesExt,
  type AccuracySeriesWeeklyRow,
} from "./types";
export { ChartFrame, type ChartFrameProps } from "./chart-frame";
export { MetricCard, type MetricCardProps } from "./metric-card";
export { MetricGrid, type MetricGridProps } from "./metric-grid";
export { ProofCompositionChart, type ProofCompositionChartProps } from "./proof-composition-chart";
export { DismissalByCategoryChart, type DismissalByCategoryChartProps, type DismissalByCategoryRow } from "./dismissal-by-category-chart";
export { CalibrationChart, type CalibrationChartProps, type CalibrationRow } from "./calibration-chart";
export { GateOutcomeBar, type GateOutcomeBarProps } from "./gate-outcome-bar";
