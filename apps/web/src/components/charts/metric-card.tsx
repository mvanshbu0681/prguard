// OWNER: t10 (wave 2).
//
// <MetricCard> — one of the six A6 accuracy metrics (dashboard blueprint §2.10,
// landing blueprint §10). An ordinary panel, not an evidence frame: Surface +
// IndexStrip + ProvenanceStrip, no registration marks (those are Exhibit-only,
// plan §2 hard rule 1). Nothing here is hard-coded — every number comes from
// the `metric` prop, which every caller builds from `AccuracyReport` (fixture
// or `useAccuracy()`, same shape either way).
//
//   ┌ / 01 — EXECUTION VERIFIED PRECISION ───────────────────────────────┐
//   │  <value>                                                            │
//   │  ├───────────●───────────┤   <low>          n = <n>        <high>  │
//   │  Of findings we claimed as proven, the share where the repro …      │
//   └ GET /v1/accuracy → precision_proxies.execution_verified_precision ──┘
import type { ReactNode } from "react";
import { chipLabel, formatScore } from "@/components/badges";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { cn } from "@/lib/utils";
import type { AccuracyMetricLike } from "./types";
import { successesFromRate, wilson } from "./wilson";

/** Below this `n` the estimate is unstable — dashboard §2.10. Still rendered, never hidden. */
const LOW_N_FLOOR = 30;

export interface MetricCardProps {
  /** The metric's machine key, e.g. "execution_verified_precision" — printed as the card's name (11px mono caps). */
  name: string;
  metric: AccuracyMetricLike;
  /** The endpoint and path this value came from — required, every rendered number names its source. */
  provenance: ReactNode;
  /** The value is not returned as-is by the API; it was computed client-side from other fields (A6's `inconclusive_rate`). */
  derivation?: ReactNode;
  /** Fixture-only shape (plan A11): appends the fixture-only note to the provenance line. */
  ext?: boolean;
  /** The card's IndexStrip number, e.g. "01". Default "01" — callers in a grid pass "01".."06". */
  index?: string;
  /** Wilson z-score. Default 1.96 (95%). */
  z?: number;
  className?: string;
}

export function MetricCard({ name, metric, provenance, derivation, ext = false, index = "01", z = 1.96, className }: MetricCardProps) {
  const { value, n, definition } = metric;
  const hasData = value != null && typeof n === "number" && n > 0;
  const lowN = hasData && n! < LOW_N_FLOOR;
  const interval = hasData ? wilson(successesFromRate(value!, n!), n!, z) : null;

  return (
    <Surface elevation={2} variant="card" className={cn("prg-metric-card flex flex-col gap-3", className)}>
      <IndexStrip index={index} category={chipLabel(name)} />
      <div className="flex flex-col gap-2">
        <p className={cn("type-readout-xl tabular", hasData ? (lowN ? "text-text-dim" : "text-text-primary") : "text-text-dim")}>
          {hasData ? formatScore(value!) : `no data (n = ${n ?? 0})`}
        </p>
        {derivation ? <p className="type-chip text-text-dim">{derivation}</p> : null}
        {hasData && interval ? (
          <div className="flex flex-col gap-1">
            <div className="relative h-3 w-full" aria-hidden="true">
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-6" />
              <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-ink-6" style={{ left: `${interval.low * 100}%` }} />
              <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-ink-6" style={{ left: `${interval.high * 100}%` }} />
              <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-signal" style={{ left: `${value! * 100}%` }} />
            </div>
            <div className="type-chip tabular flex items-center justify-between text-text-dim">
              <span>{formatScore(interval.low)}</span>
              <span>{`n = ${n}`}</span>
              <span>{formatScore(interval.high)}</span>
            </div>
          </div>
        ) : null}
        {lowN ? <p className="type-chip text-marker-text">n too small for a stable estimate</p> : null}
        <p className="type-small text-text-body">{definition}</p>
      </div>
      <ProvenanceStrip source={provenance} ext={ext} />
    </Surface>
  );
}
