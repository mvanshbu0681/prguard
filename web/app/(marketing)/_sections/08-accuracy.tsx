// OWNER: m6 (wave 3). Section 08 of 9 (plan T8): the accuracy report (landing
// blueprint §10), D3 and plan A6/A7 — six distinct metrics, all six
// published, no count-ups, every number rendered from the fixture corpus.
//
// index-label grammar (tests/unit/marketing-shell/sections.test.ts reads this
// file's raw source for it verbatim): / 08 — THE ACCURACY REPORT
//
// Server component: <MetricGrid> and <ProofCompositionChart> (both t10, wave
// 2 — composed here, not rebuilt) already read `AccuracyReport`/`AccuracySeries`
// and print every value, definition, `n` and Wilson interval themselves, plus
// the `disproven_rate` footnote (brand-gaps §2 ruling 15) and `report.caveats`
// as body text, never a tooltip (D3). Nothing on this page is a literal: the
// pull-quote's own number is `precision_proxies.self_caught_false_positive_rate`,
// not the blueprint's stale worked example (plan A7 — that example implies a
// different `n` than the backend's real formulas produce).
import Link from "next/link";
import { formatScore } from "@/components/badges";
import { SectionIndex } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import { asAccuracySeriesExt, MetricGrid, ProofCompositionChart } from "@/components/charts";
import { getAccuracy, getAccuracySeries } from "@/lib/fixtures";

export function AccuracyReport() {
  const report = getAccuracy();
  const series = asAccuracySeriesExt(getAccuracySeries());
  const selfCaught = report.precision_proxies.self_caught_false_positive_rate;

  return (
    <section id="accuracy" className="border-b border-rule-hair px-4 py-(--space-section) md:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10">
        <SectionIndex index="08" category="THE ACCURACY REPORT" />

        <div className="flex flex-col gap-4">
          <h2 className="type-display-h2 text-text-primary max-w-[16ch]">Every number has a denominator.</h2>
          <p className="max-w-(--measure-body) type-body text-text-body">
            Measured on the demo corpus over 30 days. Definitions are printed, not hovered. Intervals are Wilson score at 95%. The caveats are
            below the numbers, in the same size as the numbers.
          </p>
        </div>

        <MetricGrid report={report} ext />

        <ProofCompositionChart weekly={series.weekly} />

        {selfCaught.value != null ? (
          <div className="grid grid-cols-1 gap-6 border-t border-rule-1 pt-8 lg:grid-cols-[3fr_2fr]">
            <blockquote className="font-mono text-text-primary text-[15px] leading-relaxed tabular border-l-2 border-signal pl-5">
              <p>{`${formatScore(selfCaught.value)} (n = ${selfCaught.n}) is not our error rate.`}</p>
              <p>That is the rate at which the system caught itself</p>
              <p>before the claim reached your pull request.</p>
            </blockquote>
            <p className="type-small text-text-body self-center">
              {report.caveats.length > 0
                ? "Read the six numbers above against the caveat strip: the corpus is not a random sample of your codebase, and every n here is small enough that the intervals are wide."
                : null}
            </p>
          </div>
        ) : null}

        <Button variant="link" asChild className="self-start">
          <Link href="/accuracy">READ THE FULL ACCURACY REPORT →</Link>
        </Button>
      </div>
    </section>
  );
}
