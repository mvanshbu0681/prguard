// OWNER: t5 (wave 2). /lab/t5 — <ContributionBar> against the fixture corpus:
// the demo proven finding (0.810 critical), the demo disproven finding (clamped
// to info, its note rendered honestly), five more findings spanning every band,
// all three densities, and a 12-row glyph column the way a findings table would
// show it (dashboard blueprint §2.6, §3a).
//
// Server component: fixture loaders are server-only, so every finding is read
// here and passed down as props — nothing in this file is typed by hand.
import type { Metadata } from "next";
import { ContributionBar, toSeverityValues } from "@/components/evidence/ContributionBar";
import { formatScore } from "@/components/badges";
import { SEVERITY_BANDS } from "@/lib/contracts";
import { getDemoDisprovenFinding, getDemoProvenFinding, getFindings } from "@/lib/fixtures";
import type { Finding } from "@/lib/api-types";
import { Panel, Section } from "./parts";

export const metadata: Metadata = { title: "ContributionBar (lab)" };

export default function T5Lab() {
  const proven = getDemoProvenFinding();
  const disproven = getDemoDisprovenFinding();
  const all = getFindings();

  const excluded = new Set([proven.id, disproven.id]);
  const spanning = SEVERITY_BANDS.map((band) => all.find((f) => f.id !== proven.id && f.id !== disproven.id && f.severity?.band === band)).filter(
    (f): f is Finding => f !== undefined,
  );

  const glyphRows = [proven, disproven, ...all.filter((f) => f.severity && !excluded.has(f.id))].filter((f) => f.severity).slice(0, 12);

  return (
    <div data-surface="app" className="min-h-dvh bg-ink-0">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <header className="pb-10">
          <p className="type-label text-text-dim">/ lab — t5 · ContributionBar</p>
          <h1 className="mt-3 type-display-h2 text-text-primary">Severity is arithmetic</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            A weighted contribution bar whose total length is the score, split into the six inputs of{" "}
            <code className="type-data text-text-primary">SEVERITY_INPUTS</code>, with the band thresholds printed on the axis. Every number below is
            read from <code className="type-data text-text-primary">web/public/fixtures</code>, never typed.
          </p>
        </header>

        <Section
          index="01"
          title="The demo proven finding"
          note={`${formatScore(proven.severity!.score)}, ${proven.severity!.band} — plan A13's worked example, at all three densities. The demo run: ${proven.id.slice(0, 8)}.`}
        >
          <div className="grid grid-cols-1 gap-8">
            <Panel className="p-4 md:p-6">
              <p className="mb-3 type-label text-text-dim">detail · 640px · within an Exhibit</p>
              <ContributionBar
                score={proven.severity!.score}
                inputs={proven.severity!.inputs}
                weights={toSeverityValues(proven.severity!.weights)}
                band={proven.severity!.band}
                explanation={proven.severity!.explanation}
                findingId={proven.id}
                density="detail"
                withFrame
                index="01"
                provenance={`GET /v1/findings/${proven.id} → severity.inputs · severity.weights · severity.explanation`}
              />
            </Panel>
            <Panel className="p-4 md:p-6">
              <p className="mb-3 type-label text-text-dim">compact · 320px · master-detail pane</p>
              <ContributionBar
                score={proven.severity!.score}
                inputs={proven.severity!.inputs}
                weights={toSeverityValues(proven.severity!.weights)}
                band={proven.severity!.band}
                explanation={proven.severity!.explanation}
                findingId={proven.id}
                density="compact"
              />
            </Panel>
            <Panel className="p-4 md:p-6">
              <p className="mb-3 type-label text-text-dim">glyph · 64×10 · findings-list row</p>
              <ContributionBar score={proven.severity!.score} inputs={proven.severity!.inputs} weights={toSeverityValues(proven.severity!.weights)} band={proven.severity!.band} density="glyph" />
            </Panel>
          </div>
        </Section>

        <Section
          index="02"
          title="The demo disproven finding"
          note="The backend clamps a disproven finding's band to info and records why — severity.notes is printed here, not hidden. The score itself stays as computed (§4.4: 'the artifact of having been wrong stays legible')."
        >
          <Panel className="p-4 md:p-6">
            <ContributionBar
              score={disproven.severity!.score}
              inputs={disproven.severity!.inputs}
              weights={toSeverityValues(disproven.severity!.weights)}
              band={disproven.severity!.band}
              explanation={disproven.severity!.explanation}
              notes={disproven.severity!.notes}
              findingId={disproven.id}
              density="detail"
              withFrame
              index="02"
              provenance={`GET /v1/findings/${disproven.id} → severity.inputs · severity.weights · severity.explanation · severity.notes`}
            />
          </Panel>
        </Section>

        <Section index="03" title="Five more, spanning every band" note="One finding per band (info · low · medium · high · critical), at all three densities, read from getFindings().">
          <div className="grid grid-cols-1 gap-8">
            {spanning.map((f) => (
              <Panel key={f.id} className="p-4 md:p-6">
                <p className="mb-3 type-label text-text-dim">
                  {f.severity!.band} · finding {f.id.slice(0, 8)}
                </p>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[640px_320px_auto] lg:items-start">
                  <ContributionBar
                    score={f.severity!.score}
                    inputs={f.severity!.inputs}
                    weights={toSeverityValues(f.severity!.weights)}
                    band={f.severity!.band}
                    explanation={f.severity!.explanation}
                    notes={f.severity!.notes}
                    findingId={f.id}
                    density="detail"
                  />
                  <ContributionBar score={f.severity!.score} inputs={f.severity!.inputs} weights={toSeverityValues(f.severity!.weights)} band={f.severity!.band} density="compact" />
                  <ContributionBar score={f.severity!.score} inputs={f.severity!.inputs} weights={toSeverityValues(f.severity!.weights)} band={f.severity!.band} density="glyph" />
                </div>
              </Panel>
            ))}
          </div>
        </Section>

        <Section index="04" title="The glyph column" note="Twelve rows, the way a findings table renders density=&quot;glyph&quot; in its severity column (dashboard §2.6: 64px sparkline + band letter, 88px column).">
          <Panel className="overflow-x-auto p-4 md:p-6">
            <table className="w-full border-collapse type-data text-text-body">
              <caption className="sr-only">Twelve findings, each rendered as the severity glyph a findings table would show</caption>
              <thead>
                <tr className="border-b border-rule-1 text-text-dim">
                  <th scope="col" className="py-1.5 pr-3 text-left type-label">
                    finding
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-left type-label" style={{ width: 88 }}>
                    severity
                  </th>
                </tr>
              </thead>
              <tbody>
                {glyphRows.map((f) => (
                  <tr key={f.id} className="border-b border-rule-hair">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-text-primary">
                      {f.id.slice(0, 8)} <span className="text-text-dim">{f.title}</span>
                    </th>
                    <td className="py-1.5 pl-3">
                      <ContributionBar score={f.severity!.score} inputs={f.severity!.inputs} weights={toSeverityValues(f.severity!.weights)} band={f.severity!.band} density="glyph" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      </div>
    </div>
  );
}
