// OWNER: m2 (wave 3). <MetricReadout> — landing-blueprint §03's "teased metric"
// row (value, definition, n, Wilson interval), named in the blueprint's own
// Components list as reusable by section 10 (plan/design's accuracy report).
// It lives here, in this track's owned directory, rather than in a shared
// chart/evidence path this track does not own; a later track may compose it
// from here or build its own — plan §8 leaves that call to them.
//
// Deliberately lighter than <MetricCard> (@/components/charts): no Surface,
// no IndexStrip/ProvenanceStrip bracket. §03 places this inside its own
// hairline-ruled pre-empt box (<Surface variant="inset">), which already
// carries the frame; nesting MetricCard's own panel chrome inside that box
// would double the border. The arithmetic (Wilson interval) is the same pure
// function MetricCard uses — @/components/charts/wilson, read-only here.
import { formatScore } from "@/components/badges";
import { successesFromRate, wilson } from "@/components/charts";
import type { AccuracyMetric } from "@/lib/api-types";
import { cn } from "@/lib/utils";

export interface MetricReadoutProps {
  /** The metric's machine key, printed verbatim, lowercase mono — brand-gaps §D:
   *  a state/quantity's name in a data context is `snake_case`, never reworded. */
  name: string;
  metric: AccuracyMetric;
  /** Wilson z-score. Default 1.96 (95%). */
  z?: number;
  className?: string;
}

export function MetricReadout({ name, metric, z = 1.96, className }: MetricReadoutProps) {
  const { value, n, definition } = metric;
  const hasData = value != null && typeof n === "number" && n > 0;
  const interval = hasData ? wilson(successesFromRate(value, n), n, z) : null;

  return (
    <div className={cn("reveal flex flex-col gap-2", className)} data-anim>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-[13px] leading-[1.4] text-text-dim">{name}</span>
        <span className="type-readout text-text-primary tabular">{hasData ? formatScore(value) : "no data"}</span>
        {hasData && interval ? (
          <span className="type-chip tabular text-text-dim">
            95% CI {formatScore(interval.low)}–{formatScore(interval.high)}
          </span>
        ) : null}
        <span className="type-chip tabular text-text-dim">n = {n ?? 0}</span>
      </div>
      {hasData && interval ? (
        <div className="relative h-3 w-full max-w-[280px]" aria-hidden="true">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-6" />
          <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-ink-6" style={{ left: `${interval.low * 100}%` }} />
          <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-ink-6" style={{ left: `${interval.high * 100}%` }} />
          <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-signal" style={{ left: `${value * 100}%` }} />
        </div>
      ) : null}
      <p className="type-small text-text-body">{definition}</p>
    </div>
  );
}
