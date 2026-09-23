"use client";
// OWNER: T3 (wave 1). .draw: stroke-dashoffset on paths with pathLength="1", so one
// keyframe draws an 88px lead and a long curved lane at the same perceived speed
// (motion spec §4.7). Six paths, the paint cap for simultaneous draws (§6.1).
//   left   first appearance: each path is data-anim, drawn when the revealer reveals it
//          (staggered like any reveal); "replay" re-runs it with replayReveal()
//   right  replay: data-draw flips a ↔ b on every press (retriggerAll)
import { useRef } from "react";
import { replayReveal } from "@/motion/reveal";
import { retriggerAll } from "@/motion/stamp";
import { DUR } from "@/motion/tokens";
import { LabButton } from "./lab-ui";

// A lead-in, four parallel lanes (the S3 fan-out shape) and a lead-out.
const PATHS = [
  "M8 80 H96",
  "M96 80 C136 80 136 20 176 20 H216 C256 20 256 80 296 80",
  "M96 80 C136 80 136 60 176 60 H216 C256 60 256 80 296 80",
  "M96 80 C136 80 136 100 176 100 H216 C256 100 256 80 296 80",
  "M96 80 C136 80 136 140 176 140 H216 C256 140 256 80 296 80",
  "M296 80 H384",
] as const;

function Figure({ firstAppearance, label }: { firstAppearance: boolean; label: string }) {
  return (
    <svg viewBox="0 0 392 160" role="img" aria-label={label} className="block h-auto w-full">
      {PATHS.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className={`draw ${i === 0 || i === PATHS.length - 1 ? "stroke-signal" : "stroke-signal-lo"}`}
          data-anim={firstAppearance ? "" : undefined}
        />
      ))}
      <circle cx="96" cy="80" r="3" className="fill-signal" />
      <circle cx="296" cy="80" r="3" className="fill-signal" />
    </svg>
  );
}

export function DrawDemo() {
  const first = useRef<HTMLDivElement>(null);
  const replay = useRef<HTMLDivElement>(null);
  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-rule-1 bg-rule-1 md:grid-cols-2">
      <div className="space-y-4 bg-ink-1 p-5">
        <p className="type-label text-text-dim">first appearance · data-anim</p>
        <div ref={first}>
          <Figure firstAppearance label="Six paths drawn on first appearance" />
        </div>
        <LabButton onClick={() => first.current && replayReveal(first.current.querySelectorAll("[data-anim]"))}>replay first appearance</LabButton>
      </div>
      <div className="space-y-4 bg-ink-1 p-5">
        <p className="type-label text-text-dim">replay · data-draw a / b · {DUR.enter}ms</p>
        <div ref={replay}>
          <Figure firstAppearance={false} label="Six paths redrawn on demand" />
        </div>
        <LabButton onClick={() => replay.current && retriggerAll(replay.current, ".draw", "data-draw")}>replay draw</LabButton>
      </div>
    </div>
  );
}
