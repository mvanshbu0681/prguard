"use client";
// OWNER: d5 (wave 3). /overview — dashboard blueprint §2.1 folded into the
// brief's five bands: recent runs, gate outcome, the three headline metrics,
// the proof-composition chart at half height, and the demo run surfaced
// prominently. Single column, 1280px max (the page shell below provides the
// width and padding; AppShell's <main> supplies none of its own).
import type { ReactNode } from "react";
import { useCompactRowsToggle } from "@/components/app-shell";
import { ProofCompositionChart } from "@/components/charts";
import type { AccuracySeriesWeeklyRow } from "@/components/charts";
import { DemoRunPanel } from "./DemoRunPanel";
import { GateOutcomeSection } from "./GateOutcomeSection";
import { HeadlineMetrics } from "./HeadlineMetrics";
import { RecentRunsPanel } from "./RecentRunsPanel";

export interface OverviewRouteProps {
  /** accuracy/series.json → weekly (plan A11, fixture-only): server-loaded once, in the thin page.tsx, and handed down — no hook reads this shape, so there is nothing to poll. */
  weekly: AccuracySeriesWeeklyRow[];
}

function Band({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>;
}

export function OverviewRoute({ weekly }: OverviewRouteProps) {
  const [compact] = useCompactRowsToggle();

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="type-label text-text-dim">/ overview</p>
        <h1 className="type-display-h3 text-text-primary">What PRGuard has been proving</h1>
        <p className="type-small text-text-body">Every run it has completed, whether the gate held, and how the self-report is trending.</p>
      </header>

      <Band>
        <RecentRunsPanel compact={compact} />
      </Band>

      <Band>
        <GateOutcomeSection />
      </Band>

      <Band>
        <HeadlineMetrics />
      </Band>

      <Band>
        {/*
         * "At half height" (brief) — <ProofCompositionChart> renders its
         * ChartContainer at a fixed h-64 with no height/className passthrough
         * to that inner node (charts/proof-composition-chart.tsx only forwards
         * `className` to the outer <ChartFrame>). Rebuilding or restyling the
         * frozen wave-2 component is out of scope (plan §8), so the whole
         * frame — header, plot and legend together — is uniformly scaled by
         * 0.5 inside a height-clamped wrapper: a doubled-width inner box
         * compensates the horizontal squeeze so the result still spans the
         * column at full width, just at half the vertical footprint. Reported
         * under 'raised': t10 should add a `height`/`className`-forwarding
         * prop to the inner container so a caller can ask for this directly.
         */}
        <div className="h-44 overflow-hidden">
          <div className="w-[200%] origin-top-left" style={{ transform: "scale(0.5)" }}>
            <ProofCompositionChart weekly={weekly} index="04" provenance="accuracy/series.json → weekly" />
          </div>
        </div>
      </Band>

      <Band>
        <DemoRunPanel />
      </Band>
    </div>
  );
}
