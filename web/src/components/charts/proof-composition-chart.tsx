// OWNER: t10 (wave 2).
//
// <ProofCompositionChart> — proof-state composition over time as a 100%
// stacked area (dashboard blueprint §7 chart 2). Six bands, not the doc's
// four: `accuracy/series.json`'s weekly rows carry `skipped_no_env` and
// `not_applicable` alongside the four the blueprint table lists (fixtures
// README, plan A11) — every non-dropped finding has to land in one of them,
// and the stack should visibly sum to 100% every week. Stacking order puts
// `proven` at the floor and `disproven` directly above it, because the
// disproven band's *persistence* week over week is the argument (§7): the
// system keeps catching its own false positives, not just once.
//
// Fixture-only (plan A11, "ext"): `weekly` is not served by `GET /v1/accuracy`
// today, so a live caller passes an empty array and gets the shared empty
// state instead of an empty plot.
"use client";

import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";
import type { AccuracySeriesWeeklyRow } from "./types";

const CONFIG = {
  proven: { label: "Proven", color: "var(--chart-proven)", format: "count" },
  disproven: { label: "Disproven", color: "var(--chart-disproven)", format: "count" },
  inconclusive: { label: "Inconclusive", color: "var(--chart-inconclusive)", format: "count" },
  skipped_no_env: { label: "Skipped, no env", color: "var(--ink-5)", format: "count" },
  not_attempted: { label: "Not attempted", color: "var(--chart-not-attempted)", format: "count" },
  // --chart-not-attempted is --ink-8, the lightest of the three greys. --ink-5 and
  // --ink-7 keep the other two two rungs apart each, on a --ink-2 card — close
  // together (--ink-4, say) reads as a single indistinguishable dark smear.
  not_applicable: { label: "Not applicable", color: "var(--ink-7)", format: "count" },
} satisfies ChartConfig;

/** Draw order, floor first — proven at the bottom, disproven directly above it (see file header). */
const SERIES_ORDER = ["proven", "disproven", "inconclusive", "skipped_no_env", "not_attempted", "not_applicable"] as const;

export interface ProofCompositionChartProps {
  weekly: AccuracySeriesWeeklyRow[];
  index?: string;
  provenance?: string;
  className?: string;
}

export function ProofCompositionChart({
  weekly,
  index = "07",
  provenance = "accuracy/series.json → weekly",
  className,
}: ProofCompositionChartProps) {
  const empty = weekly.length === 0;
  return (
    <ChartFrame index={index} category="Proof-state composition" provenance={provenance} ext empty={empty} className={className}>
      <ChartContainer config={CONFIG} className={cn("aspect-auto h-64 w-full")}>
        <AreaChart data={weekly} stackOffset="expand" margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <XAxis dataKey="week_start" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => v.toFixed(3)} tickLine={false} axisLine={false} tickMargin={8} width={48} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          {SERIES_ORDER.map((key) => (
            <Area key={key} type="monotone" dataKey={key} stackId="composition" stroke="none" fill={`var(--color-${key})`} isAnimationActive={false} />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </ChartFrame>
  );
}
