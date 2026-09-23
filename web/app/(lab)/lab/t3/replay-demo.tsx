"use client";
// OWNER: T3 (wave 1). useReplay on the lab bench, bound to P. This module is what loads
// GSAP (src/motion/gsap.ts), and its useReplay disarms the handshake on the first GSAP
// frame after it mounts, so ./runtime.tsx imports it lazily: never in ?runtime=blocked,
// at 2.5s in ?runtime=late.
//
// The proven sequence (motion spec §4.6.2), every number from src/motion/tokens:
//   0          the scan line travels the bench (--dur-5 on --ease-mass, the .scan helper)
//   arrival    each pane's three row groups light at +0 / +120 / +240ms (--dur-1)
//   400        base rail wipes in (scaleY, --dur-4, instrument)
//   1400       head rail wipes in
//   1900       `1 failed` gets its 1px underline (scaleX, --dur-3)
//   2200       THE STAMP: data-state flips in 0ms, the chip scales 1.045 → 1 (--dur-2)
//   2400       `→ blocks merge` appears (--dur-1)
//   2520→6520  the hold: nothing moves
import { progressAt } from "@/motion/bezier";
import { DUR, DUR_S, EASE, ROW_GROUP_DELAYS, sec } from "@/motion/tokens";
import { useReplay } from "@/motion/useReplay";
import { Bench, type BenchIds } from "./bench";
import { Kbd, LabButton, Readouts } from "./lab-ui";

const AT = { railBase: 400, railHead: 1400, underline: 1900, stamp: 2200, caption: 2400 } as const;
const HOLD_MS = 4000;

export function ReplayDemo({ ids }: { ids: BenchIds }) {
  const { ref, play, restart, pause, step, isPlaying, progress, beat, beats, reduced } = useReplay<HTMLDivElement>(
    (tl, { root, q, flip, retrigger, beat: mark, reduced: calm }) => {
      const scan = root.querySelector<HTMLElement>("[data-scan]");
      const travel = Math.max(0, root.clientHeight - 2);
      if (scan && !calm) {
        scan.style.setProperty("--scan-travel", `${travel}px`); // on the line itself, never :root
        retrigger(scan, "data-scan", 0.001);
      }
      // Row groups light as the scan reaches each pane: +0 / +120 / +240ms (§2.3).
      for (const pane of q("[data-pane]")) {
        const firstRow = pane.querySelector<HTMLElement>("[data-group='1']");
        const top = firstRow ? firstRow.getBoundingClientRect().top - root.getBoundingClientRect().top : 0;
        const arrival = travel > 0 ? progressAt(EASE.mass.points, Math.min(1, top / travel)) * DUR_S.scan : 0;
        ROW_GROUP_DELAYS.forEach((delay, i) => {
          const rows = pane.querySelectorAll(`[data-group='${i + 1}']`);
          tl.fromTo(rows, { opacity: 0.35 }, { opacity: 1, duration: DUR_S.hover, ease: EASE.instrument.gsap }, arrival + sec(delay));
        });
      }
      tl.fromTo(q("[data-rail='base']"), { scaleY: 0 }, { scaleY: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap }, sec(AT.railBase));
      tl.fromTo(q("[data-rail='head']"), { scaleY: 0 }, { scaleY: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap }, sec(AT.railHead));
      mark("scan", DUR_S.scan);
      tl.fromTo(q("[data-underline]"), { scaleX: 0 }, { scaleX: 1, duration: DUR_S.reveal, ease: EASE.instrument.gsap }, sec(AT.underline));
      mark("rails", sec(AT.underline + DUR.reveal));
      flip(q("[data-verdict]"), "data-state", "not_attempted", "proven", sec(AT.stamp)); // 0ms colour
      retrigger(q("[data-verdict]"), "data-stamp", sec(AT.stamp)); // the paired 180ms scale
      mark("stamp", sec(AT.stamp + DUR.state));
      tl.fromTo(q("[data-caption]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR_S.hover, ease: EASE.instrument.gsap }, sec(AT.caption));
      mark("verdict", sec(AT.caption + DUR.hover));
      tl.to({}, { duration: sec(HOLD_MS) }, sec(AT.caption + DUR.hover)); // the hold
    },
    { key: "p", trackProgress: true },
  );

  return (
    <div className="space-y-4">
      <Bench ref={ref} ids={ids} />
      <div className="flex flex-wrap items-center gap-3">
        {/* Reduced motion: P steps beat by beat (§5); play / restart land on the end frame. */}
        <LabButton onClick={reduced ? step : restart} aria-keyshortcuts="P">
          {reduced ? "step" : "replay"} <Kbd>P</Kbd>
        </LabButton>
        <LabButton onClick={play}>{reduced ? "end frame" : "play"}</LabButton>
        <LabButton onClick={pause} disabled={!isPlaying}>
          pause
        </LabButton>
        <Readouts
          className="md:ml-auto"
          items={[
            { label: "state", value: isPlaying ? "playing" : "idle" },
            { label: "progress", value: progress.toFixed(3) },
            { label: "beat", value: `${beat} / ${beats}` },
            { label: "reduced", value: reduced ? "yes · P steps beats" : "no" },
          ]}
        />
      </div>
    </div>
  );
}
