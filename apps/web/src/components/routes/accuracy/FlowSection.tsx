// Where findings go: what the specialists raised against what reached a pull
// request, what happened when Witness tried to prove a claim, and what the
// merge gate did with the result. One segmented bar per stage (the kit's
// StackBar), keyed underneath with count and share; the gate as one square per
// verdict, so "14 of 72" is something you can see rather than a thin stripe.
import { ShieldAlert } from "lucide-react";
import { Button, Card, GATE_COLOR, PROOF_ENCODING, SectionHeader, StackBar } from "@/components/dash/kit";
import { auditHref } from "@/lib/hooks";
import type { AccuracyReport } from "@/lib/api-types";
import { duration, percent } from "./derive";
import s from "./accuracy.module.css";

interface Seg {
  label: string;
  value: number;
  color: string;
}

function Keys({ segs, total }: { segs: Seg[]; total: number }) {
  return (
    <div className={s.fKeys}>
      {segs.map((g) => (
        <div key={g.label} className={s.fKey} style={{ ["--k" as string]: g.color }}>
          <span className={s.fKeyLabel}>{g.label}</span>
          <span className={s.fKeyValue}>
            {g.value}
            <small>{total ? percent(g.value / total) : "—"}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function FlowSection({ report }: { report: AccuracyReport }) {
  const f = report.findings;
  const raised = f.proposed ?? 0;
  const findingSegs: Seg[] = [
    { label: "Published to the PR", value: f.published ?? 0, color: "var(--w-chart-1)" },
    { label: "Suppressed by a rule", value: f.suppressed ?? 0, color: "var(--w-chart-5)" },
    { label: "Dropped by the coordinator", value: f.dropped_by_coordinator ?? 0, color: "var(--w-chart-6)" },
  ];
  // The rest never reached a PR either: claims its own proof refuted, then
  // anything still unresolved. Both come from the same report.
  const rest = Math.max(0, raised - findingSegs.reduce((a, g) => a + g.value, 0));
  // One segment, so ink keeps meaning "published" in this bar; the key splits it.
  const refutedRest = Math.min(rest, report.proof.disproven ?? 0);
  if (rest)
    findingSegs.push({
      label: refutedRest && rest - refutedRest ? `Refuted ${refutedRest}, open ${rest - refutedRest}` : refutedRest ? "Refuted by its own test" : "Still open",
      value: rest,
      color: "var(--w-surface-3)",
    });

  const p = report.proof;
  const attempted = p.attempted ?? 0;
  const proofSegs: Seg[] = PROOF_ENCODING.slice(0, 4).map((k) => ({
    label: k.key === "skipped_no_env" ? "No runnable env" : k.label,
    value: (p[k.key as "proven" | "disproven" | "inconclusive" | "skipped_no_env"] as number | undefined) ?? 0,
    color: k.color,
  }));

  const g = report.gate;
  const red = g.runs_red ?? 0;
  const green = g.runs_green ?? 0;
  const neutral = g.runs_neutral ?? 0;
  const verdicts = red + green + neutral;
  const overrides = g.break_glass_overrides ?? 0;
  const cells = [
    ...Array.from({ length: red }, () => "red"),
    ...Array.from({ length: green }, () => "green"),
    ...Array.from({ length: neutral }, () => "neutral"),
  ];

  return (
    <section className={s.flowGrid} aria-label="Where findings go">
      <Card tone="surface" pad="lg" className={s.flowCard}>
        <SectionHeader title="From raised to proven" description="What the specialists raised, what reached a pull request, and what held up when run." />

        <div className={s.fRow}>
          <div className={s.fHead}>
            <span className={s.fNum}>{f.published ?? 0}</span>
            <span className={s.fOf}>of {raised}</span>
            <span className={s.fPhrase}>findings raised reached a pull request</span>
          </div>
          <StackBar size="lg" legend={false} segments={findingSegs} label={`${raised} raised: ${findingSegs.map((x) => `${x.value} ${x.label.toLowerCase()}`).join(", ")}`} />
          <Keys segs={findingSegs} total={raised} />
        </div>

        <div className={s.fRow}>
          <div className={s.fHead}>
            <span className={s.fNum}>{p.proven ?? 0}</span>
            <span className={s.fOf}>of {attempted}</span>
            <span className={s.fPhrase}>proof attempts reproduced the bug</span>
          </div>
          <StackBar size="lg" legend={false} segments={proofSegs} label={`${attempted} attempted: ${proofSegs.map((x) => `${x.value} ${x.label.toLowerCase()}`).join(", ")}`} />
          <Keys segs={proofSegs} total={attempted} />
        </div>

        <p className={s.fFoot}>
          <span>
            <b>{(f.per_review_published_mean ?? 0).toFixed(3)}</b> published per review
          </span>
          <span>
            <b>{report.runs.total ?? 0}</b> runs · {report.runs.succeeded ?? 0} succeeded, {report.runs.failed ?? 0} failed, {report.runs.cancelled ?? 0} cancelled
          </span>
          <span>
            median review <b>{duration(report.runs.median_duration_seconds)}</b>
          </span>
        </p>
      </Card>

      <Card tone="surface" pad="lg" className={s.gateCard}>
        <SectionHeader title="The merge gate" />
        <p className={s.gateLine}>
          {red} <span>of {verdicts} gates held a merge.</span>
        </p>
        <p className={s.gateSub}>Each red gate was a proven bug at or above the block threshold. Unproven findings only ever comment.</p>
        {verdicts > 0 ? (
          <div className={s.gateUnits} role="img" aria-label={`${red} blocked, ${green} clear, ${neutral} neutral`}>
            {cells.map((kind, i) => (
              <i key={i} data-kind={kind} />
            ))}
          </div>
        ) : null}
        <div className={s.gateKey} aria-hidden>
          <span>
            <i style={{ background: GATE_COLOR.failure }} />
            <b>{red}</b> blocked
          </span>
          <span>
            <i data-kind="green" style={{ background: GATE_COLOR.success }} />
            <b>{green}</b> clear
          </span>
          <span>
            <i style={{ background: GATE_COLOR.neutral }} />
            <b>{neutral}</b> neutral
          </span>
        </div>
        <div className={s.gateFoot}>
          <span className={s.gateFootIcon} aria-hidden>
            <ShieldAlert size={16} strokeWidth={1.9} />
          </span>
          <p className={s.gateFootText}>
            <b>
              {overrides} break-glass {overrides === 1 ? "override" : "overrides"}
            </b>
            A proven finding suppressed with a written reason.
          </p>
          <Button variant="outline" size="sm" href={auditHref("/audit", { event_type: "override.break_glass" })}>
            Audit log
          </Button>
        </div>
      </Card>
    </section>
  );
}
