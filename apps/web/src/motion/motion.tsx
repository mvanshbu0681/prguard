"use client";
// OWNER: T3 (wave 1). The DASHBOARD-ONLY animation entry: Motion 13.4 via LazyMotion.
//
// Mount once, around the dashboard route group (app/(app)/layout.tsx):
//
//   <MotionProvider>{children}</MotionProvider>
//
// then animate with `m.*` (never `motion.*`: LazyMotion is strict, so a stray
// `motion.div` throws instead of silently pulling the full ~34 KB bundle).
// Motion never enters app/(marketing)/ (ESLint + `npm run motion:lint`) and never
// drives scroll (plan §2 hard rule 2).
//
// What the provider sets:
//   - LazyMotion, features = domAnimation, loaded as a separate chunk after first
//     render (§3.1: ~4.6 KB initial + ~15 KB deferred).
//   - MotionConfig reducedMotion="user" (the OS preference drops transform
//     animations), upgraded to "always" while html[data-motion="reduced"] is set, so
//     the footer toggle and the OS preference are one code path (§5).
//   - The default transition is a tween on --dur-2 / --ease-snap. Motion's default
//     is a spring; springs are banned except LAYOUT_SPRING (ζ = 1.009, §3.3).
//   - Once the features chunk has loaded and Motion's frame loop has run a frame,
//     markAnimReady("motion") disarms the fallback handshake.
//
// Dashboard ceiling: nothing here exceeds 220ms, except the three shared evidence
// components (ProofBench, ChainRail, ContributionBar), which enter at --dur-4 on
// both surfaces (brand-gaps §2 ruling 7): transitions.evidenceEnter.

import { frame, LazyMotion, MotionConfig, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { markAnimReady } from "./handshake";
import { useMotionOverride } from "./reduced";
import { DUR_S, EASE, LAYOUT_SPRING } from "./tokens";

export { AnimatePresence, LayoutGroup, m } from "motion/react";
export type { HTMLMotionProps, SVGMotionProps, Transition, Variants } from "motion/react";
export { useSequence } from "./useSequence";
export type { Sequence, SequenceOptions, SequenceStep } from "./useSequence";
export { useReducedMotion } from "./reduced";

const tween = (duration: number, ease: typeof EASE.snap.points): Transition => ({ type: "tween", duration, ease: [...ease] });

/**
 * Named Motion transitions on the token grid, inside the 220ms dashboard ceiling.
 * The settle tier (--dur-3, 240ms) and the entrance tier (--dur-4) are downgraded to
 * --dur-2 here: brand-gaps §2 ruling 7, "everything else on the dashboard obeys 220ms".
 * Only the three shared evidence components keep their own tiers (evidence*).
 */
export const transitions = {
  /** --dur-1 / snap: hover, focus, keyboard row move, terminal row append. */
  hover: tween(DUR_S.hover, EASE.snap.points),
  /** --dur-2 / snap: the MotionConfig default (tooltips, dropdowns, dialogs, chips). */
  state: tween(DUR_S.state, EASE.snap.points),
  /** Small reveals, strike-throughs (ledger revoke, suppressed row): --dur-3 downgraded to --dur-2. */
  reveal: tween(DUR_S.state, EASE.instrument.points),
  /** Dashboard entrance: downgraded to --dur-2 (§2.4 rule 5). */
  enter: tween(DUR_S.state, EASE.instrument.points),
  /** Shared evidence components only: their --dur-3 beats (tamper desaturate, hash-diff expand). */
  evidenceReveal: tween(DUR_S.reveal, EASE.instrument.points),
  /** Shared evidence components only: --dur-4 entrance on both surfaces (ruling 7). */
  evidenceEnter: tween(DUR_S.enter, EASE.instrument.points),
  /** --dur-exit / exit: every dismiss. */
  exit: tween(DUR_S.exit, EASE.exit.points),
  /** layoutId morph (severity chip, row → sticky header): a tween, not a spring (§4.4.2). */
  morph: tween(DUR_S.state, EASE.snap.points),
  /** The one permitted spring (critically damped), for layout morphs of unknown travel. */
  layoutSpring: { ...LAYOUT_SPRING } as Transition,
} as const;

export const MOTION_DEFAULT_TRANSITION: Transition = transitions.state;

let readyScheduled = false;

/** The deferred feature bundle. Resolving it (then one Motion frame) disarms the handshake. */
export function loadMotionFeatures() {
  return import("./motion-features").then((mod) => {
    if (!readyScheduled) {
      readyScheduled = true;
      frame.postRender(() => markAnimReady("motion"));
    }
    return mod.default;
  });
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const forced = useMotionOverride() === "reduced";
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={forced ? "always" : "user"} transition={MOTION_DEFAULT_TRANSITION}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
