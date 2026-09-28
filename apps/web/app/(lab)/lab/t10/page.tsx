// OWNER: t10 (wave 2). /lab/t10 — the chart layer: the six A6 accuracy
// metrics and the four /accuracy charts, built from the real fixture corpus
// (getAccuracy(), getAccuracySeries(), getReviewsIndex() — src/lib/fixtures.ts,
// server-only). Nothing on this page is a literal; every number renders from
// the corpus, so a regenerated fixture changes this page without a code edit.
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { asAccuracySeriesExt, CalibrationChart, DismissalByCategoryChart, GateOutcomeBar, MetricGrid, ProofCompositionChart } from "@/components/charts";
import type { ReviewListItem } from "@/lib/api-types";
import { getAccuracy, getAccuracySeries, getReviewsIndex } from "@/lib/fixtures";
import { Section } from "./section";

export const metadata: Metadata = { title: "Charts and accuracy (lab)" };

const PAPER: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
};

/** The same three-way tally GateOutcomeBar wants, built from a reviews list instead of the accuracy report — a run with no verdict yet (`null`) reads as neutral, same as GateChip's "undecided" state. */
function gateCountsFromReviews(items: Pick<ReviewListItem, "gate_conclusion">[]) {
  let runsRed = 0;
  let runsGreen = 0;
  let runsNeutral = 0;
  for (const item of items) {
    if (item.gate_conclusion === "failure") runsRed += 1;
    else if (item.gate_conclusion === "success") runsGreen += 1;
    else runsNeutral += 1;
  }
  return { runsRed, runsGreen, runsNeutral };
}

export default function T10Lab() {
  const report = getAccuracy();
  const series = asAccuracySeriesExt(getAccuracySeries());
  const reviews = getReviewsIndex();
  const reviewsGate = gateCountsFromReviews(reviews.items);

  return (
    <div data-surface="app" className="min-h-dvh bg-ink-0" style={PAPER}>
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <header className="pb-10">
          <p className="type-label text-text-dim">/ lab — t10 · charts and accuracy</p>
          <h1 className="mt-3 type-display-h2 text-text-primary">Charts and the accuracy self-report</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            The six A6 metrics as cards, then the four /accuracy charts, all built from{" "}
            <code className="type-chip">getAccuracy()</code> and <code className="type-chip">getAccuracySeries()</code> (
            <code className="type-chip">web/public/fixtures/accuracy</code>). No number on this page is a literal.
          </p>
        </header>

        <Section index="01" title="The six metrics" note="Plan A6's order: execution_verified_precision, self_caught_false_positive_rate, human_dismissal_rate, addressed_rate, proven_rate, inconclusive_rate — not the older six the blueprints carry, which counted disproven_rate twice.">
          <MetricGrid report={report} />
        </Section>

        <Section index="02" title="Proof-state composition" note="100% stacked area by week, six bands: accuracy/series.json's weekly rows carry skipped_no_env and not_applicable alongside the blueprint's original four.">
          <ProofCompositionChart weekly={series.weekly} />
        </Section>

        <Section index="03" title="Human dismissal rate by category" note="Horizontal bars, sorted descending by the computed rate; n printed on every bar, including a category with zero dismissals.">
          <DismissalByCategoryChart categories={series.dismissal_by_category} />
        </Section>

        <Section index="04" title="Calibration — predicted band vs observed addressed rate" note="A scatter against the y = x diagonal, a Wilson 95% whisker per point. The info band has n = 0 in this corpus and reads as “no data”, never a hidden row.">
          <CalibrationChart calibration={series.calibration} />
        </Section>

        <Section
          index="05"
          title="Gate outcome"
          note="The same shape, two sources: the accuracy report's own gate tally, and an aggregation over reviews/index.json's gate_conclusion — GateOutcomeBar takes plain counts, so either one works."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GateOutcomeBar index="05" runsRed={report.gate.runs_red ?? 0} runsGreen={report.gate.runs_green ?? 0} runsNeutral={report.gate.runs_neutral ?? 0} />
            <GateOutcomeBar
              index="06"
              runsRed={reviewsGate.runsRed}
              runsGreen={reviewsGate.runsGreen}
              runsNeutral={reviewsGate.runsNeutral}
              provenance="reviews/index.json → items[].gate_conclusion (aggregated)"
              ext
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
