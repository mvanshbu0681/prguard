// Severity you can recompute: the score is Σ input × weight over six inputs,
// so the card prints exactly that sum — a stacked bar of the contributions
// against the band thresholds, then one row per input (input × weight =
// contribution, its track as long as the weight allows), then the total.
import { Info } from "lucide-react";
import { Card, Tag } from "@/components/dash/kit";
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS } from "@/lib/contracts";
import type { Finding } from "@/lib/api-types";
import { fixed3, severityTerms } from "./format";
import s from "./detail.module.css";

/** One colour per input, heaviest first: lime leads, then a greyscale ramp of the chart ink (flips with the theme). */
const INPUT_COLOR = [
  "var(--w-lime)",
  "var(--w-chart-1)",
  "color-mix(in srgb, var(--w-chart-1) 74%, var(--w-surface-3))",
  "color-mix(in srgb, var(--w-chart-1) 56%, var(--w-surface-3))",
  "color-mix(in srgb, var(--w-chart-1) 40%, var(--w-surface-3))",
  "color-mix(in srgb, var(--w-chart-1) 26%, var(--w-surface-3))",
];

const TICKS = [
  { at: SEVERITY_THRESHOLDS.low, band: "low" },
  { at: SEVERITY_THRESHOLDS.medium, band: "medium" },
  { at: SEVERITY_THRESHOLDS.high, band: "high" },
  { at: SEVERITY_THRESHOLDS.critical, band: "critical" },
] as const;

function bandTone(band: string) {
  return band === "critical" ? "danger" : band === "high" ? "warn" : "soft";
}

export function SeverityCard({ finding }: { finding: Finding }) {
  const sev = finding.severity;
  if (!sev) {
    return (
      <Card as="section" tone="surface" pad="lg" className={s.cardBody} aria-label="Severity">
        <h2 className={s.cardTitle}>Severity</h2>
        <p className={s.muted}>Not scored. The coordinator set this finding aside before severity was computed.</p>
      </Card>
    );
  }
  const terms = severityTerms(SEVERITY_INPUTS, sev.inputs as unknown as Record<string, number>, sev.weights);
  const sum = terms.reduce((a, t) => a + t.contribution, 0);
  const maxWeight = Math.max(...terms.map((t) => t.weight), 0.0001);
  const crossed = TICKS.filter((t) => sum >= t.at).at(-1);
  const hint = sev.llm_severity_hint;

  return (
    <Card as="section" tone="surface" pad="lg" className={s.cardBody} aria-labelledby="severity-title">
      <div className="flex flex-col gap-2">
        <div className={s.cardHead}>
          <h2 id="severity-title" className={s.cardTitle}>
            Severity
          </h2>
          <Tag tone={bandTone(sev.band)} size="sm">
            {sev.band}
          </Tag>
        </div>
        <p className={s.muted}>Six weighted inputs, added up. No model picks the number, so you can check it by hand.</p>
      </div>

      <div className={s.sumBar} role="img" aria-label={`Contributions sum to ${fixed3(sum)} on a 0 to 1 scale; band thresholds at ${TICKS.map((t) => t.at).join(", ")}`}>
        <div className={s.sumTrack}>
          {terms.map((t, i) =>
            t.contribution > 0 ? <i key={t.key} style={{ width: `${t.contribution * 100}%`, background: INPUT_COLOR[i], animationDelay: `${i * 70}ms` }} /> : null,
          )}
        </div>
        {TICKS.map((t) => (
          <span key={t.band} className={s.tick} style={{ left: `${t.at * 100}%` }} data-crossed={sum >= t.at ? "" : undefined}>
            {t.at.toFixed(2).replace(/^0/, "")}
          </span>
        ))}
      </div>

      <ol className={s.sevRows} aria-label="Weighted inputs">
        {terms.map((t, i) => (
          <li key={t.key} className={s.sevRow} aria-label={`${t.label}: ${t.input.toFixed(2)} × ${t.weight.toFixed(2)} = ${fixed3(t.contribution)}`}>
            <span className={s.sevLabel}>
              <i className="size-2 flex-none rounded-[3px]" style={{ background: INPUT_COLOR[i] }} aria-hidden />
              {t.label}
            </span>
            <span className={s.sevMath} aria-hidden>
              {t.input.toFixed(2)} × {t.weight.toFixed(2)}
            </span>
            <span className={s.sevValue} aria-hidden>
              {fixed3(t.contribution)}
            </span>
            <span className={s.sevTrack} style={{ width: `${(t.weight / maxWeight) * 100}%` }} aria-hidden>
              <i style={{ width: `${t.input * 100}%`, background: INPUT_COLOR[i], animationDelay: `${i * 70}ms` }} />
            </span>
          </li>
        ))}
      </ol>

      <div className={s.sigma}>
        <span className={s.sigmaLabel}>{crossed ? `Total, above the ${crossed.at.toFixed(3)} cut-off` : `Total, below the ${SEVERITY_THRESHOLDS.low.toFixed(3)} cut-off`}</span>
        <span className={s.sigmaValue}>= {fixed3(sum)}</span>
      </div>

      {sev.notes?.map((note) => (
        <p key={note} className={s.note}>
          <Info size={15} strokeWidth={1.9} aria-hidden />
          <span>
            Band {note.replace(/^clamped to (\w+):/, "clamped to $1:")}. The score stays as computed; the band is what the gate reads.
          </span>
        </p>
      ))}
      {hint && hint !== sev.band ? (
        <p className={s.note}>
          <Info size={15} strokeWidth={1.9} aria-hidden />
          <span>
            The specialist guessed <b className="font-semibold text-w-text">{hint}</b>. Witness never takes a model&apos;s word for severity; the computed band is{" "}
            <b className="font-semibold text-w-text">{sev.band}</b>.
          </span>
        </p>
      ) : null}
    </Card>
  );
}
