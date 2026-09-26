"use client";
// OWNER: d1 (wave 3). RESULT's gate block (dashboard §2.5: "280×64px, the only chromatic
// element on the screen by default"). <GateBlock>'s own `conclusion: GateReading` collapses
// null into RUNNING (design §1.8) — correct for a live run still deciding, wrong for a
// terminal run that never reached a gate at all (failed before delivery, or cancelled /
// superseded). Those two cases render a plain note instead of a mislabelled GateBlock, using
// the run's own RunError (ReviewStatus.error — ReviewResult carries no error field).
import { GateBlock } from "@/components/badges";
import type { GateInfo, RunError } from "@/lib/api-types";
import { Warn } from "@/components/icons";

export interface GateAreaProps {
  gate: GateInfo | null | undefined;
  error: RunError | null | undefined;
  className?: string;
  /**
   * The run is still LIVE (queued/running) rather than terminal (raised, wave 3 fix pass —
   * props.ts has no field for this; GateArea is fully owned by this track). A `null` gate
   * reading here means "still deciding", which `<GateBlock>` already renders as the neutral
   * RUNNING state (design §1.8) — exactly what this component's own header comment
   * documents as the correct reading of a missing gate. The "no gate decision for this run"
   * note stays reserved for a genuinely TERMINAL run that never reached one at all (failed
   * before delivery, cancelled, superseded).
   */
  live?: boolean;
}

export function GateArea({ gate, error, className, live = false }: GateAreaProps) {
  if (gate || live) {
    return (
      <GateBlock
        className={className}
        conclusion={gate?.conclusion ?? null}
        blocking={gate?.blocking_finding_ids?.length}
        delivery={gate?.delivery}
        reason={gate?.reason}
      />
    );
  }
  return (
    <div className={`flex h-16 w-[280px] max-w-full flex-col justify-center gap-1 overflow-hidden rounded-data border border-rule-2 px-3 ${className ?? ""}`}>
      <span className="flex items-center gap-2 type-badge text-text-dim">
        <Warn className="size-3 shrink-0" aria-hidden="true" />
        GATE · N/A
      </span>
      <span className="truncate font-mono text-[11px] leading-[1.4] text-text-dim">
        {error ? `${error.code}: ${error.message}` : "no gate decision for this run"}
      </span>
    </div>
  );
}
