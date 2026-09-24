// OWNER: d3 (wave 3). §03 — WHY THIS SCORE (dashboard-blueprint §2.7, §3a).
// <ContributionBar density="detail" withFrame> — the component wraps itself
// in <Exhibit> when `withFrame` is passed, so this file only supplies data.
import { ContributionBar, toSeverityValues } from "@/components/evidence/ContributionBar";
import type { Finding } from "@/lib/api-types";

export function SeveritySection({ finding }: { finding: Finding }) {
  const severity = finding.severity;
  if (!severity) {
    return (
      <section aria-labelledby="fd-03" className="rounded-panel border border-rule-1 bg-ink-2 px-4 py-5 md:px-6">
        <h2 id="fd-03" className="type-label text-text-dim">
          / 03 — WHY THIS SCORE
        </h2>
        <p className="mt-3 type-body text-text-body">This finding was not scored.</p>
      </section>
    );
  }
  return (
    <ContributionBar
      score={severity.score}
      inputs={severity.inputs}
      weights={toSeverityValues(severity.weights)}
      band={severity.band}
      explanation={severity.explanation}
      notes={severity.notes}
      findingId={finding.id}
      density="detail"
      withFrame
      index="03"
      provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → severity.inputs · severity.weights · severity.explanation`}
    />
  );
}
