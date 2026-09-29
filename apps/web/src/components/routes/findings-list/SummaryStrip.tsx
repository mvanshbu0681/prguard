"use client";
// The composition of the current view, above the inbox: how severe it is, how
// much of it Witness proved by running a test, and what is holding a merge.
// Three different shapes on purpose (a composition bar, a proof ratio, one ink
// number with the view's one lime action), never three identical stat tiles.
import { ArrowUpRight, X } from "lucide-react";
import { Button, Card, PROOF_ENCODING, Skeleton, StackBar, Stat, bandColor, type StackSegment } from "@/components/dash/kit";
import type { SeverityBand } from "@/lib/contracts";
import { noBlockingReason, type FindingsSummary } from "./format";
import type { StatusView } from "./types";
import s from "./findings.module.css";

const BANDS_DESC: readonly SeverityBand[] = ["critical", "high", "medium", "low", "info"];

export interface SummaryStripProps {
  summary: FindingsSummary | undefined;
  status: StatusView;
  /** blocking=true is the active filter. */
  blockingOnly: boolean;
  onToggleBlocking: () => void;
}

function severitySegments(summary: FindingsSummary): StackSegment[] {
  const segments: StackSegment[] = BANDS_DESC.map((band) => ({ value: summary.bands[band], color: bandColor(band), label: band }));
  if (summary.unscored > 0) segments.push({ value: summary.unscored, color: "var(--w-surface-3)", label: "unscored" });
  return segments.filter((g) => g.value > 0);
}

/** The kit's proof colour code (lime proven, ink refuted, amber inconclusive …), in its legend order. */
function proofSegments(summary: FindingsSummary): StackSegment[] {
  return PROOF_ENCODING.map((p) => ({ value: summary.proof[p.key], color: p.color, label: p.label.toLowerCase() })).filter((g) => g.value > 0);
}

function Pending() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-[14px] w-full rounded-w-pill" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function SummaryStrip({ summary, status, blockingOnly, onToggleBlocking }: SummaryStripProps) {
  const ruledOut = noBlockingReason(status);
  const highOrWorse = summary ? summary.bands.critical + summary.bands.high : 0;
  const scored = summary ? summary.total - summary.unscored : 0;

  return (
    <section className={s.summary} aria-label="Summary of this view">
      <Card tone="surface" pad="lg" className={s.sumCard}>
        {!summary ? (
          <>
            <span className={s.sumLabel}>High or critical</span>
            <Pending />
          </>
        ) : summary.total === 0 ? (
          <>
            <Stat size="md" label="High or critical" value="0" />
            <p className={s.sumNote}>Nothing in this view.</p>
          </>
        ) : scored === 0 ? (
          <>
            <Stat size="md" label="Computed severity" value="—" />
            <div className="flex flex-col gap-3">
              <StackBar size="lg" segments={severitySegments(summary)} legend={false} label={`${summary.unscored} unscored`} />
              <p className={s.sumNote}>Not scored: the coordinator set these aside before severity was computed.</p>
            </div>
          </>
        ) : (
          <>
            <Stat size="md" label="High or critical" value={highOrWorse.toLocaleString("en-US")} unit={`of ${scored.toLocaleString("en-US")} scored`} />
            <StackBar size="lg" segments={severitySegments(summary)} />
          </>
        )}
      </Card>

      <Card tone="surface" pad="lg" className={s.sumCard}>
        {!summary ? (
          <>
            <span className={s.sumLabel}>Proven by execution</span>
            <Pending />
          </>
        ) : (
          <>
            <Stat
              size="md"
              label="Proven by execution"
              value={summary.proof.proven.toLocaleString("en-US")}
              unit={summary.total > 0 ? `of ${summary.total.toLocaleString("en-US")}` : undefined}
            />
            {summary.total > 0 ? <StackBar segments={proofSegments(summary)} /> : null}
          </>
        )}
      </Card>

      {summary && summary.blocking === 0 && !blockingOnly && ruledOut ? (
        <Card tone="surface" pad="lg" className={`${s.sumCard} ${s.blockCard}`}>
          <Stat size="md" label="Blocking a merge" value="0" hint={ruledOut} />
        </Card>
      ) : summary && summary.blocking === 0 && !blockingOnly ? (
        <Card tone="lime" pad="lg" className={`${s.sumCard} ${s.blockCard}`}>
          <Stat size="md" on="lime" label="Blocking a merge" value="0" hint="Nothing in this view holds a merge gate." />
        </Card>
      ) : (
        <Card tone="ink" pad="lg" className={`${s.sumCard} ${s.blockCard}`}>
          <Stat
            size="md"
            on="ink"
            label={blockingOnly ? "Showing only what blocks" : "Blocking a merge"}
            value={summary ? summary.blocking.toLocaleString("en-US") : "…"}
            hint="Only a proven bug can hold the gate."
          />
          <div className={s.blockFoot}>
            {blockingOnly ? (
              <Button variant="primary" size="sm" icon={X} onClick={onToggleBlocking}>
                Show all
              </Button>
            ) : (
              <Button variant="primary" size="sm" chip={ArrowUpRight} onClick={onToggleBlocking} disabled={!summary}>
                Review blocking
              </Button>
            )}
          </div>
        </Card>
      )}
    </section>
  );
}
