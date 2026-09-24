// OWNER: t10 (wave 2).
//
// <CalibrationChart> — predicted severity band vs observed addressed rate
// (dashboard blueprint §7 chart 4, "the one no competitor can draw"): a
// scatter of `(predicted_score_mean, addressed / n)` per band, a reference
// diagonal (a perfectly calibrated system's points sit on it), and a Wilson
// 95% whisker per point computed from the band's own raw `addressed`/`n`
// counts — no rounding round-trip, the interval uses the integers straight
// from `accuracy/series.json → calibration`.
//
// A band with `n = 0` (this corpus: `info`) is never hidden (dashboard §7: "If
// `n` is too small per band, it renders the points it has ... never hidden"):
// it is omitted from the scatter (there is no y value to plot) but still
// counted in the printed `n per band: … ` line and called out as "no data".
//
// Fixture-only (plan A11): empty input renders the shared "not served" state.
"use client";

import { ErrorBar, Line, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { formatScore } from "@/components/badges";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { SEVERITY_BANDS, type SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";
import { wilson } from "./wilson";

export interface CalibrationRow {
  band: SeverityBand;
  predicted_score_mean: number | null;
  addressed: number;
  n: number;
}

export interface CalibrationChartProps {
  calibration: CalibrationRow[];
  index?: string;
  provenance?: string;
  className?: string;
}

const CONFIG = {
  observed: { label: "Observed addressed rate", color: "var(--chart-series)", format: "rate" },
} satisfies ChartConfig;

/** The diagonal a perfectly calibrated predictor sits on. */
const DIAGONAL = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

interface Point {
  band: SeverityBand;
  x: number;
  y: number;
  n: number;
  addressed: number;
  low: number;
  high: number;
  /** [below y, above y] — recharts ErrorBar wants offsets from the value, not absolute bounds. */
  yErr: [number, number];
}

export function CalibrationChart({ calibration, index = "09", provenance = "accuracy/series.json → calibration", className }: CalibrationChartProps) {
  const byBand = new Map(calibration.map((row) => [row.band, row]));
  const ordered = SEVERITY_BANDS.filter((band) => byBand.has(band)).map((band) => byBand.get(band)!);
  const empty = ordered.length === 0;

  const points: Point[] = ordered
    .filter((row) => row.n > 0 && row.predicted_score_mean !== null)
    .map((row) => {
      const y = row.addressed / row.n;
      const { low, high } = wilson(row.addressed, row.n);
      return { band: row.band, x: row.predicted_score_mean as number, y, n: row.n, addressed: row.addressed, low, high, yErr: [y - low, high - y] };
    });

  const nPerBand = ordered.map((row) => (row.n > 0 ? String(row.n) : "no data")).join(" / ");
  const bandLabels = ordered.map((row) => row.band).join(" / ");

  return (
    <ChartFrame index={index} category="Calibration — predicted vs observed" provenance={provenance} ext empty={empty} className={className}>
      <div className="flex flex-col gap-2">
        <ChartContainer config={CONFIG} className={cn("aspect-square h-72 w-full max-w-[420px]")}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }} accessibilityLayer>
            <XAxis type="number" dataKey="x" domain={[0, 1]} name="predicted" tickFormatter={(v: number) => v.toFixed(3)} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis type="number" dataKey="y" domain={[0, 1]} name="observed" tickFormatter={(v: number) => v.toFixed(3)} tickLine={false} axisLine={false} tickMargin={8} width={48} />
            <ZAxis range={[64, 64]} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={() => null}
                  formatter={(_value, _name, item) => {
                    const p = item.payload as Point;
                    return (
                      <span className="type-chip tabular text-text-body">
                        {`${p.band} · predicted ${formatScore(p.x)} · observed ${formatScore(p.y)} [${formatScore(p.low)}, ${formatScore(p.high)}] · n = ${p.n}`}
                      </span>
                    );
                  }}
                />
              }
            />
            <Line data={DIAGONAL} dataKey="y" stroke="var(--chart-reference)" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} legendType="none" />
            <Scatter data={points} dataKey="y" fill="var(--color-observed)" isAnimationActive={false}>
              <ErrorBar dataKey="yErr" direction="y" width={4} strokeWidth={1} stroke="var(--chart-reference)" />
            </Scatter>
          </ScatterChart>
        </ChartContainer>
        <p className="type-chip tabular text-text-dim">{`n per band (${bandLabels}): ${nPerBand}`}</p>
      </div>
    </ChartFrame>
  );
}
