// OWNER: t10 (wave 2).
//
// <DismissalByCategoryChart> — human dismissal rate by finding category,
// horizontal bars sorted descending, `n` printed on each bar (dashboard
// blueprint §7 chart 3). The rate (`dismissed / published`) is computed here
// from the two raw counts `accuracy/series.json → dismissal_by_category`
// carries — nothing is a pre-computed literal.
//
// Fixture-only (plan A11): empty input renders the shared "not served" state.
"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";

export interface DismissalByCategoryRow {
  category: string;
  dismissed: number;
  published: number;
}

export interface DismissalByCategoryChartProps {
  categories: DismissalByCategoryRow[];
  index?: string;
  provenance?: string;
  className?: string;
}

const CONFIG = {
  rate: { label: "Dismissal rate", color: "var(--chart-series)", format: "rate" },
} satisfies ChartConfig;

interface Row {
  category: string;
  rate: number;
  dismissed: number;
  published: number;
  label: string;
}

function toRows(categories: DismissalByCategoryRow[]): Row[] {
  return categories
    .map((c) => {
      const rate = c.published > 0 ? c.dismissed / c.published : 0;
      return { category: c.category, rate, dismissed: c.dismissed, published: c.published, label: `${rate.toFixed(3)} · n = ${c.published}` };
    })
    .sort((a, b) => b.rate - a.rate);
}

export function DismissalByCategoryChart({ categories, index = "08", provenance = "accuracy/series.json → dismissal_by_category", className }: DismissalByCategoryChartProps) {
  const rows = toRows(categories);
  const empty = rows.length === 0;
  const height = Math.max(160, rows.length * 40 + 40);

  return (
    <ChartFrame index={index} category="Human dismissal rate by category" provenance={provenance} ext empty={empty} className={className}>
      <ChartContainer config={CONFIG} className={cn("aspect-auto w-full")} style={{ height }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 56, bottom: 0, left: 8 }} accessibilityLayer>
          <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(3)} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} width={128} tickFormatter={(v: string) => v.replaceAll("_", " ")} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          {/* minPointSize: a category with rate 0 (no dismissals) still needs a visible bar to print its label on — a true zero-width rect never mounts. */}
          <Bar dataKey="rate" fill="var(--color-rate)" isAnimationActive={false} maxBarSize={20} minPointSize={2}>
            <LabelList dataKey="label" position="right" className="fill-text-dim type-chip tabular" />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}
