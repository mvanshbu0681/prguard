"use client";
// OWNER: T3 (wave 1). useSequence: timed beats with no animation engine, the
// dashboard's replay primitive (GSAP never enters app/(app)/). Nine stations advance
// one beat at a time; each beat only sets React state. The stage label flips in 0ms
// and stamps (useStamp); the running station carries the heartbeat. Bound to S.
// The server render is the end frame: every station done.
import { useState } from "react";
import { STAGES } from "@/lib/contracts";
import { heartbeatProps } from "@/motion/heartbeat";
import { useStamp } from "@/motion/stamp";
import { DUR } from "@/motion/tokens";
import { useSequence, type SequenceStep } from "@/motion/useSequence";
import { Kbd, LabButton, Readouts } from "./lab-ui";

const STEP_MS = DUR.enter; // one station per beat
const HOLD_MS = 1200;

export function SequenceDemo() {
  const [active, setActive] = useState<number>(STAGES.length); // every station done
  const steps: SequenceStep[] = [...STAGES.map((stage, i) => ({ at: i * STEP_MS, apply: () => setActive(i), label: stage })), { at: STAGES.length * STEP_MS, apply: () => setActive(STAGES.length), label: "done" }];
  const { ref, play, restart, step, isPlaying, beat, beats, progress, reduced } = useSequence<HTMLDivElement>(steps, {
    key: "s",
    hold: HOLD_MS,
    reset: () => setActive(-1),
  });
  const stamp = useStamp(active);
  const label = active < 0 ? "queued" : active >= STAGES.length ? "succeeded" : `${active + 1} / ${STAGES.length} · ${STAGES[active]}`;

  return (
    <div className="space-y-4">
      <div ref={ref} className="rounded-panel border border-rule-1 bg-ink-1 p-5 inset-shadow-hi">
        <ol className="flex items-center justify-between gap-1" aria-label="Pipeline stages">
          {STAGES.map((stage, i) => {
            const state = i < active ? "done" : i === active ? "running" : "pending";
            return (
              <li key={stage} className="flex min-w-0 flex-1 flex-col items-center gap-2" data-state={state}>
                {/* Three shapes, not three colours: hollow, ring + centre, filled. */}
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden className="block">
                  {state === "pending" ? <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth={1} className="stroke-ink-6" /> : null}
                  {state === "running" ? (
                    <>
                      <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth={1} className="heartbeat stroke-signal-hi" {...heartbeatProps(0)} />
                      <circle cx="8" cy="8" r="3" className="fill-signal-hi" />
                    </>
                  ) : null}
                  {state === "done" ? <circle cx="8" cy="8" r="7" className="fill-signal-lo" /> : null}
                </svg>
                <span className="hidden type-label text-text-dim md:block">{stage}</span>
                <span className="sr-only">
                  {stage}: {state}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule-1 pt-3">
          <span className="type-label text-text-dim">stage</span>
          <span className="stamp type-data text-text-primary" data-stamp={stamp} role="status">
            {label}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LabButton onClick={reduced ? step : restart} aria-keyshortcuts="S">
          {reduced ? "step" : "replay"} <Kbd>S</Kbd>
        </LabButton>
        <LabButton onClick={play}>{reduced ? "end frame" : "play"}</LabButton>
        <Readouts
          className="ml-auto"
          items={[
            { label: "state", value: isPlaying ? "playing" : "idle" },
            { label: "progress", value: progress.toFixed(3) },
            { label: "beat", value: `${beat} / ${beats}` },
          ]}
        />
      </div>
    </div>
  );
}
