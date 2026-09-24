"use client";
// OWNER: d1 (wave 3). The run header, shared by LIVE and RESULT (dashboard §2.4/§2.5): repo,
// PR, head SHA, risk tier, trigger and elapsed — the one panel that never remounts across the
// live → result transition (plan §2 hard rule "0ms colour flip", read together with the
// blueprint's "never a route change, never a remount"). Not evidence-bearing (it is page
// chrome describing where the run's own identity came from, not an artifact PRGuard is
// proving a claim about), so it gets the ordinary-panel bracket (Surface + IndexStrip +
// ProvenanceStrip), never <Exhibit>'s registration marks (plan §2 rule 1).
import type { ReactNode } from "react";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import type { ReviewRunStatus, ReviewTrigger, RiskTier } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { NO_VALUE } from "./format";

export interface RunHeaderProps {
  reviewId: string;
  status: ReviewRunStatus;
  repoLabel?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prAuthor?: string | null;
  prUrl?: string | null;
  headSha?: string | null;
  baseSha?: string | null;
  riskTier?: RiskTier | null;
  trigger?: ReviewTrigger | null;
  /** Pre-formatted (@/components/routes/run/format's formatElapsed) — ticking while live, static once terminal. */
  elapsedLabel: string;
  provenance: string;
  meta?: ReactNode;
  onRerun?: () => void;
  rerunPending?: boolean;
  className?: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-text-dim">{label}</span>
      <span className="text-text-body">{children}</span>
    </span>
  );
}

export function RunHeader({
  reviewId,
  status,
  repoLabel,
  prNumber,
  prTitle,
  prAuthor,
  prUrl,
  headSha,
  baseSha,
  riskTier,
  trigger,
  elapsedLabel,
  provenance,
  meta,
  onRerun,
  rerunPending = false,
  className,
}: RunHeaderProps) {
  const identifier = repoLabel ? (prNumber != null ? `${repoLabel}#${prNumber}` : repoLabel) : `run ${reviewId.slice(0, 7)}`;

  return (
    <Surface as="header" elevation={1} variant="panel" className={cn("flex flex-col gap-3 px-4 py-3", className)}>
      <IndexStrip
        index="01"
        category="RUN"
        identifier={identifier}
        meta={
          <span className="flex items-center gap-3">
            {meta}
            <span className="type-label text-text-dim">{status.toUpperCase()}</span>
          </span>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {prTitle ? <p className="type-body truncate text-text-primary">{prTitle}</p> : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 type-data text-[11px]">
            {prUrl ? (
              <a href={prUrl} target="_blank" rel="noreferrer" className="link-draw text-text-body">
                {prAuthor ? `@${prAuthor}` : "pull request ↗"}
              </a>
            ) : prAuthor ? (
              <span className="text-text-body">@{prAuthor}</span>
            ) : null}
            <Field label="head">{headSha ? headSha.slice(0, 7) : NO_VALUE}</Field>
            <Field label="base">{baseSha ? baseSha.slice(0, 7) : NO_VALUE}</Field>
            <Field label="risk">{riskTier ?? NO_VALUE}</Field>
            <Field label="trigger">{trigger ?? NO_VALUE}</Field>
            <Field label="elapsed">{elapsedLabel}</Field>
          </p>
        </div>
        {onRerun ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRerun} loading={rerunPending}>
            RE-RUN
          </Button>
        ) : null}
      </div>
      <ProvenanceStrip source={provenance} />
    </Surface>
  );
}
