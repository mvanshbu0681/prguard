"use client";
// OWNER: t7 (wave 2). /lab/t7's "live" demonstration: a local timer standing in for
// GET /v1/reviews/{id} polling (dashboard §5.1), so <StageRail mode="live"> can be judged
// without a running backend. One scripted timeline covers every StageState — pending,
// running, done, a genuine stale-heartbeat degraded moment at S3, and a failed variant at
// S7 — then loops, so a --timeline screenshot at any offset lands on a real state.
import { useEffect, useState } from "react";
import { StageRail, stageStatesFromReviewStatus } from "@/components/evidence/StageRail";
import type { ReviewStatusLike } from "@/components/evidence/StageRail";
import type { GateConclusion, Stage } from "@/lib/contracts";
import { STAGES } from "@/lib/contracts";

interface Beat extends ReviewStatusLike {
  atMs: number;
}

// Every `atMs` is relative to the loop's own start. The run reaches `specialists`, goes
// quiet there (heartbeat 25s: past HEARTBEAT.staleAfterMs, @/motion/tokens) and recovers,
// exactly the "run appears stalled, then isn't" case dashboard-blueprint §2.4's error band
// exists for — then fails outright at `proof`, the one stage a repro genuinely can refute.
const TIMELINE: readonly Beat[] = [
  { atMs: 0, status: "queued", stage_index: 0, seconds_since_heartbeat: 0 },
  { atMs: 500, status: "running", stage_index: 1, seconds_since_heartbeat: 1 },
  { atMs: 1100, status: "running", stage_index: 2, seconds_since_heartbeat: 1 },
  { atMs: 1700, status: "running", stage_index: 3, seconds_since_heartbeat: 2 },
  { atMs: 2600, status: "running", stage_index: 3, seconds_since_heartbeat: 25 }, // stale -> degraded
  { atMs: 4200, status: "running", stage_index: 4, seconds_since_heartbeat: 1 }, // recovered
  { atMs: 4900, status: "running", stage_index: 5, seconds_since_heartbeat: 1 },
  { atMs: 5500, status: "running", stage_index: 6, seconds_since_heartbeat: 1 },
  { atMs: 6100, status: "running", stage_index: 7, seconds_since_heartbeat: 1 },
  { atMs: 7200, status: "failed", stage_index: 7, seconds_since_heartbeat: 1 }, // fails at proof
];
const LOOP_MS = 10_200;

interface LiveSimProps {
  stageLabels: Partial<Record<Stage, string>>;
  expectedMs: Partial<Record<Stage, number>>;
  provenance: string;
}

export function LiveSim({ stageLabels, expectedMs, provenance }: LiveSimProps) {
  const [beat, setBeat] = useState<Beat>(TIMELINE[0]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    const runFrom = (startedAt: number) => {
      for (const step of TIMELINE) {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setBeat(step);
          }, step.atMs),
        );
      }
      timers.push(
        setTimeout(() => {
          if (!cancelled) runFrom(startedAt);
        }, LOOP_MS),
      );
    };
    runFrom(Date.now());
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const stages = stageStatesFromReviewStatus(beat);
  const gate: GateConclusion | undefined = beat.status === "failed" ? "failure" : beat.status === "succeeded" ? "success" : undefined;
  const currentLabel = beat.stage_index ? STAGES[beat.stage_index - 1] : null;

  return (
    <StageRail
      mode="live"
      orientation="horizontal"
      stages={stages}
      stageIndex={beat.stage_index}
      secondsSinceHeartbeat={beat.seconds_since_heartbeat}
      stageLabels={stageLabels}
      expectedMs={expectedMs}
      gate={gate}
      index="03"
      category="LIVE SIMULATION"
      identifier={currentLabel ?? "queued"}
      provenance={provenance}
    />
  );
}
