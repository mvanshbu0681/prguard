// OWNER: t4 (wave 2). The replay's beats, as data (motion spec §4.6.2, track brief REPLAY).
// No GSAP, no DOM: this module only says WHEN each stage number is reached. ProofBench turns
// it into useSequence steps; every "lit" flag a render needs is `stage >= STAGE.x`, computed
// in the component, never re-derived from milliseconds at render time.
import { DUR } from "@/motion/tokens";

/** Monotonically increasing: stage N implies every stage before it has also fired. */
export const STAGE = {
  rest: 0,
  scanStart: 1, // t=0: scan line departs, pane A group 0 ignites
  paneA1: 2, // t=120
  paneA2: 3, // t=240: pane A fully lit
  railA: 4, // t=400: pane A rail wipes in
  paneB0: 5, // t=900
  paneB1: 6, // t=1020
  paneB2: 7, // t=1140: pane B fully lit, ahead of its rail
  railB: 8, // t=1400: pane B rail wipes in (scan line lands)
  underline: 9, // t=1900: the failing pane's summary line underlines
  stamp: 10, // t=2200: THE STAMP — 0ms colour flip + .stamp scale
  consequence: 11, // t=2400: the consequence line fades in; the 4000ms hold begins here
} as const;

export type Stage = (typeof STAGE)[keyof typeof STAGE];

/** { at (ms), stage } pairs, in order — the sequence a run steps through after `reset()`. */
export const BEATS: readonly { at: number; stage: Stage }[] = [
  { at: 0, stage: STAGE.scanStart },
  { at: 120, stage: STAGE.paneA1 },
  { at: 240, stage: STAGE.paneA2 },
  { at: 400, stage: STAGE.railA },
  { at: 900, stage: STAGE.paneB0 },
  { at: 1020, stage: STAGE.paneB1 },
  { at: 1140, stage: STAGE.paneB2 },
  { at: DUR.scan, stage: STAGE.railB }, // 1400 — the scan line's own 1400ms travel lands here
  { at: 1900, stage: STAGE.underline },
  { at: 2200, stage: STAGE.stamp },
  { at: 2400, stage: STAGE.consequence },
] as const;

/** t=2400 → t=6400: the 4000ms hold (motion §4.6.2). Nothing fires after `consequence`. */
export const HOLD_MS = 4000;

/** Total run length in ms (last beat + the hold) — 2400 + 4000 = 6400. */
export const TOTAL_MS = BEATS[BEATS.length - 1].at + HOLD_MS;
