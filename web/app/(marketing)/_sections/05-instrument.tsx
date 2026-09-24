// OWNER: m4 (wave 3). Section 05 of 9 (plan T8) — THE INSTRUMENT FACE (landing
// blueprint §05; dashboard blueprint §3a; plan §13 A13). Job: kill the
// suspicion that severity is an LLM adjective. A visitor can check the
// arithmetic by eye.
//
// A server component: the demo proven finding's severity is read here with the
// server-only fixture loader and passed straight into <ContributionBar> — the
// instrument itself (score, band, six weighted inputs, threshold ticks, the
// input table and its Σ row) is entirely <ContributionBar density="detail"
// withFrame> (wave 2, composed, never rebuilt or restyled). This file supplies
// only the section's own copy: the index head, the headline, the subhead and
// the band legend — plain server HTML, complete at first paint (no
// IntersectionObserver, no client gate).
//
// Plan A13: the fixture's inputs (reachability 1.0, blast_radius 0.7,
// path_sensitivity 1.0, coverage_gap 0.5, churn 0.3, proof_confidence 1.0) are
// the ones that genuinely score 0.810 through the backend's own severity.compute
// — the blueprint's own worked-example table is NOT copied here; every number
// below renders from web/public/fixtures.
import { Grain, SectionIndex } from "@/components/chrome";
import { ContributionBar, toSeverityValues } from "@/components/evidence/ContributionBar";
import { BandLegend } from "@/components/sections/instrument/BandLegend";
import { getDemoProvenFinding } from "@/lib/fixtures";

export function InstrumentFace() {
  const finding = getDemoProvenFinding();
  const severity = finding.severity;

  return (
    <section id="severity" className="relative isolate border-b border-rule-hair px-4 py-(--space-section) md:px-8">
      <Grain />
      <div className="relative mx-auto max-w-[1200px]">
        {/* Section index grammar: "/ 05 — THE INSTRUMENT FACE" (marketing-shell's
            MARKETING_SECTIONS, t8a, wave 3 — the nav's own category for this id).
            The artifact's own <Exhibit> below prints its own, narrower category,
            "COMPUTED SEVERITY" (<ContributionBar>'s own default, wave 2) — the
            section describes the belief it changes, the exhibit describes the
            evidence. */}
        <SectionIndex index="05" category="THE INSTRUMENT FACE" />

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,620px)_1fr] lg:gap-16">
          <div>
            <h2 className="type-display-h2 text-text-primary">Severity is arithmetic.</h2>
            <p className="mt-5 max-w-(--measure-body) type-lead text-text-body">
              Six inputs, each normalised to 0..1. Six fixed weights. The band thresholds are printed on the same axis as the
              score. No model decides how bad it is.
            </p>
            <BandLegend className="mt-6" />
          </div>

          {severity ? (
            <div className="min-w-0">
              <ContributionBar
                score={severity.score}
                inputs={severity.inputs}
                weights={toSeverityValues(severity.weights)}
                band={severity.band}
                explanation={severity.explanation}
                notes={severity.notes ?? undefined}
                findingId={finding.id}
                density="detail"
                withFrame
                index="05"
                provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → severity.inputs · severity.weights · severity.explanation`}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
