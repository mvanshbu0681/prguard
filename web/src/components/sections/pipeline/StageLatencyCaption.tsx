// OWNER: m4 (wave 3). The per-stage p50/p95 caption under section 06's diagram
// (landing blueprint §06: "render the per-stage p50/p95 latencies from the cost
// summary as a quiet caption"). CostSummary is fixture-only (Ext), so this is
// the one line in the section that says so explicitly rather than leaving it
// to the <StageRail> Exhibit's own `ext` flag to imply.
import { cn } from "@/lib/utils";
import type { CostSummary } from "@/lib/api-types";
import { formatLatency, stageLatencies } from "./stage-latency";

export interface StageLatencyCaptionProps {
  costSummary: CostSummary;
  className?: string;
}

export function StageLatencyCaption({ costSummary, className }: StageLatencyCaptionProps) {
  const rows = stageLatencies(costSummary);
  return (
    // flex-wrap, not inline text wrapping: each stage is one nowrap phrase, but the
    // browser wraps freely BETWEEN phrases (a plain inline run with no space between
    // two whitespace-nowrap spans has no break opportunity at all and overflows the
    // viewport as one unbroken line — this is why it is a flex row, not a <p> of spans).
    <div className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1 type-data text-[11px] text-text-dim", className)}>
      {rows.map((row) => (
        <span key={row.stage} className="whitespace-nowrap">
          {row.stage} p50 <span className="tabular text-text-body">{formatLatency(row.p50)}</span> / p95{" "}
          <span className="tabular text-text-body">{formatLatency(row.p95)}</span>
        </span>
      ))}
    </div>
  );
}
