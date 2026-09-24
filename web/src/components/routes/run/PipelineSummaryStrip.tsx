"use client";
// OWNER: d1 (wave 3). RESULT's collapsed pipeline summary (dashboard §2.5: "the stage rail
// collapses to a 40px completed summary strip — all nine done, total wall clock, the one
// degraded stage flagged"). The full instrument (<StageRail mode="static">, every station
// with its own state) lives one click away in the "Pipeline" sub-tab — this strip is the
// always-visible receipt that the run happened, not a second copy of the diagram.
import { StageDot } from "@/components/badges";
import type { StageEntry } from "@/components/evidence/StageRail";
import { formatDurationSeconds, NO_VALUE } from "./format";

export interface PipelineSummaryStripProps {
  /** stageStatesFromReviewStatus(status) — the same mapper <StageRail mode="live"> uses. */
  stages: readonly StageEntry[];
  wallClockSeconds: number | null | undefined;
  className?: string;
}

export function PipelineSummaryStrip({ stages, wallClockSeconds, className }: PipelineSummaryStripProps) {
  const failedAt = stages.find((s) => s.state === "failed");
  const degradedCount = stages.filter((s) => s.state === "degraded").length;

  return (
    <div className={`flex h-10 items-center justify-between gap-4 border-b border-rule-hair px-1 ${className ?? ""}`}>
      <ol className="flex items-center gap-1.5" aria-label="Pipeline stages, summary">
        {stages.map(({ key, state }, i) => (
          <li key={key} className="flex items-center gap-1.5">
            <StageDot state={state} size={10} label={`S${i + 1} ${key} — ${state}`} />
          </li>
        ))}
      </ol>
      <p className="type-data text-[11px] text-text-dim">
        {failedAt ? (
          <span className="text-alarm-text">stopped at {failedAt.key}</span>
        ) : degradedCount > 0 ? (
          <span className="text-marker-text">
            {degradedCount} stage{degradedCount === 1 ? "" : "s"} degraded
          </span>
        ) : (
          "9/9 stages complete"
        )}
        {" · "}
        wall clock {wallClockSeconds != null ? formatDurationSeconds(wallClockSeconds) : NO_VALUE}
      </p>
    </div>
  );
}
