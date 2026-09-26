// OWNER: t10 (wave 2).
//
// <GateOutcomeBar> — one horizontal stacked bar of gate conclusions across
// runs (dashboard blueprint §7, "/ Overview": "the gate-outcome stacked bar —
// a single BarChart with layout='vertical' and one row — cheaper and more
// legible than a donut"). Three segments: blocked (the one chromatic gate
// state — --alarm, fill-only), clear (**achromatic** success — --signal-lo,
// never green, R3/dashboard §0.1), neutral (--ink-6). Labels reuse the exact
// chip vocabulary from @/components/badges (BLOCKED / CLEAR / NEUTRAL) so the
// same state reads the same word everywhere in the product.
"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { GATE } from "@/components/badges";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";

export interface GateOutcomeBarProps {
  runsRed: number;
  runsGreen: number;
  runsNeutral: number;
  index?: string;
  provenance?: string;
  /** Fixture-only shape note (plan A11). False for a live `GET /v1/accuracy → gate` caller. */
  ext?: boolean;
  className?: string;
}

const CONFIG = {
  blocked: { label: GATE.failure.label, color: "var(--alarm)", format: "count" },
  clear: { label: GATE.success.label, color: "var(--signal-lo)", format: "count" },
  neutral: { label: GATE.neutral.label, color: "var(--ink-6)", format: "count" },
} satisfies ChartConfig;

export function GateOutcomeBar({ runsRed, runsGreen, runsNeutral, index = "10", provenance = "GET /v1/accuracy → gate", ext = false, className }: GateOutcomeBarProps) {
  const total = runsRed + runsGreen + runsNeutral;
  const empty = total === 0;
  const data = [{ name: "runs", blocked: runsRed, clear: runsGreen, neutral: runsNeutral }];

  return (
    <ChartFrame
      index={index}
      category="Gate outcome"
      provenance={provenance}
      ext={ext}
      empty={empty}
      meta={<span className="type-chip tabular text-text-dim">{`n = ${total}`}</span>}
      className={className}
    >
      <div className="flex flex-col gap-2">
        <ChartContainer config={CONFIG} className={cn("aspect-auto h-12 w-full")}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
            <XAxis type="number" hide domain={[0, total || 1]} />
            <YAxis type="category" dataKey="name" hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Bar dataKey="blocked" stackId="gate" fill="var(--color-blocked)" isAnimationActive={false} />
            <Bar dataKey="clear" stackId="gate" fill="var(--color-clear)" isAnimationActive={false} />
            <Bar dataKey="neutral" stackId="gate" fill="var(--color-neutral)" isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <div className="type-chip tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-text-dim">
          <Legend swatch="var(--alarm)" label={GATE.failure.label} value={runsRed} />
          <Legend swatch="var(--signal-lo)" label={GATE.success.label} value={runsGreen} />
          <Legend swatch="var(--ink-6)" label={GATE.neutral.label} value={runsNeutral} />
        </div>
      </div>
    </ChartFrame>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block size-2" style={{ backgroundColor: swatch }} />
      {`${label} ${value}`}
    </span>
  );
}
