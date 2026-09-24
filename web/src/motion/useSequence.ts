// OWNER: T3 (wave 1). useSequence: timed beats without an animation engine.
//
// For the dashboard (GSAP may never enter app/(app)/) and for shared evidence
// components that render on both surfaces. Each step says WHEN (ms from t = 0)
// and WHAT (a function that applies that beat's state: set a data attribute,
// retrigger a CSS helper, set React state). CSS does the tweening; this only
// decides the instant.
//
//   const { ref, play, isPlaying, beat, beats } = useSequence<HTMLDivElement>(
//     [
//       { at: 0,    apply: () => setPhase("scan") },
//       { at: 2200, apply: () => setStatus("proven") },   // 0ms colour flip + stamp (useStamp)
//       { at: 2400, apply: () => setPhase("verdict") },
//     ],
//     { key: "p", hold: 4000, reset: () => { setPhase("start"); setStatus("not_attempted"); } },
//   );
//   <div ref={ref} data-phase={phase}>…</div>
//
// DESTRUCTURE the result, as above: `ref={seq.ref}` makes the React Compiler lint treat
// the whole `seq` object as a ref (react-hooks/refs) and flags every `seq.x` read.
//
// Timing: a timer wakes one frame early, then requestAnimationFrame applies every
// step that is due, so each beat lands on the frame nearest its time (±half a
// frame) and a stalled frame catches up in order, never skipping a step. Nothing
// runs per frame during a hold. The same steps give the same frames on every run
// (no randomness; the motion lint bans Math.random here).
//
// Rest state = end frame: before the first play, the DOM is whatever the server
// rendered, which must already be the end state (motion spec §0 rule 1). `reset`
// (or the step at 0) must establish the start state for a replay.
//
// Reduced motion (OS or data-motion="reduced"): play()/restart() jump straight to
// the end frame (every step applied at once, in order); the bound key steps beat by
// beat instead (motion spec §5: "press P repeatedly to step through").

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useAutoplay, type Autoplay } from "./autoplay";
import { useKeyBinding, type KeySpec } from "./keys";
import { useReducedMotion } from "./reduced";

export interface SequenceStep {
  /** Milliseconds from the start of the sequence. */
  at: number;
  /** Apply this beat's state. Must be idempotent and deterministic. */
  apply(): void;
  /** A stop point when stepping beat by beat. Default true; set false for steps that belong to the next beat. */
  beat?: boolean;
  /** For readouts and debugging. */
  label?: string;
}

export interface SequenceClock {
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  setTimer(cb: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(id: ReturnType<typeof setTimeout>): void;
}

export interface SequencerState {
  playing: boolean;
  /** Steps applied in the current run. At rest (end frame) this equals `steps`. */
  applied: number;
  steps: number;
  /** 0…1 over the steps plus the hold; updated per applied step, not per frame. */
  progress: number;
  /** Beats applied, for "beat 3 / 6" readouts. */
  beat: number;
  beats: number;
}

export interface SequencerOptions {
  clock?: SequenceClock;
  /** Establish the start state before a run (and before a jump to the end). */
  reset?: () => void;
  /** Milliseconds after the last step before the run ends (the 4s hold). */
  hold?: () => number;
  onChange?: (state: SequencerState) => void;
  onEnd?: () => void;
}

export interface Sequencer {
  play(): void;
  restart(): void;
  pause(): void;
  jumpToEnd(): void;
  stepBeat(): void;
  state(): SequencerState;
  dispose(): void;
}

const FRAME_MS = 1000 / 60;
/** A step due within half a frame is applied in this frame. */
const SLACK_MS = FRAME_MS / 2;
/** Wake one frame early, then align to a frame. */
const LEAD_MS = FRAME_MS;

export const browserClock: SequenceClock = {
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(() => cb()),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (id) => clearTimeout(id),
};

function ordered(steps: readonly SequenceStep[]): SequenceStep[] {
  // Stable sort by time: equal times keep their declared order.
  return steps
    .map((s, i) => ({ s, i }))
    .sort((x, y) => x.s.at - y.s.at || x.i - y.i)
    .map(({ s }) => s);
}

const countBeats = (steps: readonly SequenceStep[]) => steps.filter((s) => s.beat !== false).length;

/** The scheduler behind useSequence, framework-free (tests drive it with a fake clock). */
export function createSequencer(getSteps: () => readonly SequenceStep[], options: SequencerOptions = {}): Sequencer {
  const clock = options.clock ?? browserClock;
  let steps = ordered(getSteps());
  let cursor = steps.length; // at rest = at the end frame
  let beat = countBeats(steps);
  let playing = false;
  let startAt = 0;
  let pausedElapsed: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame: number | null = null;
  let disposed = false;

  const total = () => Math.max(0, steps.length ? steps[steps.length - 1].at : 0) + Math.max(0, options.hold?.() ?? 0);

  const snapshot = (): SequencerState => {
    const t = total();
    let progress: number;
    if (cursor >= steps.length && !playing && pausedElapsed === null) progress = 1;
    else if (t === 0) progress = cursor >= steps.length ? 1 : 0;
    else {
      const elapsed = playing ? clock.now() - startAt : (pausedElapsed ?? 0);
      progress = Math.min(1, Math.max(0, elapsed / t));
    }
    return { playing, applied: cursor, steps: steps.length, progress, beat, beats: countBeats(steps) };
  };
  const emit = () => options.onChange?.(snapshot());

  const stop = () => {
    if (timer !== null) clock.clearTimer(timer);
    if (frame !== null) clock.cancelFrame(frame);
    timer = null;
    frame = null;
  };

  const applyOne = () => {
    const step = steps[cursor];
    cursor++;
    if (step.beat !== false) beat++;
    step.apply();
  };

  const finish = () => {
    stop();
    playing = false;
    pausedElapsed = null;
    cursor = steps.length;
    beat = countBeats(steps);
    emit();
    options.onEnd?.();
  };

  const applyDue = () => {
    const elapsed = clock.now() - startAt;
    let changed = false;
    while (cursor < steps.length && steps[cursor].at <= elapsed + SLACK_MS) {
      applyOne();
      changed = true;
    }
    if (changed) emit();
  };

  const schedule = () => {
    if (!playing || disposed) return;
    const elapsed = clock.now() - startAt;
    if (cursor < steps.length) {
      const wait = Math.max(0, steps[cursor].at - elapsed - LEAD_MS);
      timer = clock.setTimer(() => {
        timer = null;
        frame = clock.requestFrame(() => {
          frame = null;
          applyDue();
          schedule();
        });
      }, wait);
      return;
    }
    const remaining = total() - elapsed;
    if (remaining <= 0) finish();
    else
      timer = clock.setTimer(() => {
        timer = null;
        finish();
      }, remaining);
  };

  const begin = (fromElapsed: number) => {
    playing = true;
    pausedElapsed = null;
    startAt = clock.now() - fromElapsed;
    const before = cursor;
    applyDue(); // emits when it applied something
    if (cursor === before) emit(); // publish playing = true
    schedule();
  };

  const freshRun = () => {
    stop();
    steps = ordered(getSteps());
    cursor = 0;
    beat = 0;
    options.reset?.();
  };

  return {
    play() {
      if (disposed || playing) return;
      if (pausedElapsed !== null) begin(pausedElapsed);
      else {
        freshRun();
        begin(0);
      }
    },
    restart() {
      if (disposed) return;
      freshRun();
      begin(0);
    },
    pause() {
      if (disposed || !playing) return;
      stop();
      pausedElapsed = clock.now() - startAt;
      playing = false;
      emit();
    },
    jumpToEnd() {
      if (disposed) return;
      freshRun();
      while (cursor < steps.length) applyOne();
      finish();
    },
    stepBeat() {
      if (disposed) return;
      stop();
      playing = false;
      pausedElapsed = null;
      if (cursor >= steps.length) freshRun();
      if (steps.length === 0) return finish();
      // Apply through the next stop point (at least one step).
      while (cursor < steps.length) {
        const isBeat = steps[cursor].beat !== false;
        applyOne();
        if (isBeat) break;
      }
      if (cursor >= steps.length) finish();
      else emit();
    },
    state: snapshot,
    dispose() {
      disposed = true;
      stop();
    },
  };
}

export interface SequenceOptions {
  /** Key(s) that restart the sequence (P, D …). Ignored while typing or with a modifier. */
  key?: KeySpec;
  /** Default "none". Autoplay never gates visibility. */
  autoplay?: Autoplay;
  /** For autoplay "in-view": the visible fraction that starts it (default 0.35). */
  inViewThreshold?: number;
  /** Establish the start state before each run. */
  reset?: () => void;
  /** Milliseconds after the last step before the run ends (e.g. the 4000ms hold). */
  hold?: number;
  onEnd?: () => void;
}

export interface Sequence<T extends Element> {
  /** Attach to the set-piece root (used by autoplay "in-view"). */
  ref: RefObject<T | null>;
  /** Resume if paused, else restart. Under reduced motion: jump to the end frame. */
  play(): void;
  /** Run from t = 0. Under reduced motion: jump to the end frame. */
  restart(): void;
  pause(): void;
  /** Apply the next beat with no tweening (what the key does under reduced motion). */
  step(): void;
  isPlaying: boolean;
  progress: number;
  beat: number;
  beats: number;
  reduced: boolean;
}

export function useSequence<T extends Element = HTMLElement>(steps: readonly SequenceStep[], options: SequenceOptions = {}): Sequence<T> {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const stepsRef = useRef(steps);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    stepsRef.current = steps;
    optionsRef.current = options;
  });
  const [state, setState] = useState<SequencerState>(() => {
    const n = steps.length;
    const beats = countBeats(steps);
    return { playing: false, applied: n, steps: n, progress: 1, beat: beats, beats };
  });
  const seqRef = useRef<Sequencer | null>(null);

  useEffect(() => {
    const seq = createSequencer(() => stepsRef.current, {
      reset: () => optionsRef.current.reset?.(),
      hold: () => optionsRef.current.hold ?? 0,
      onChange: setState,
      onEnd: () => optionsRef.current.onEnd?.(),
    });
    seqRef.current = seq;
    return () => {
      seq.dispose();
      if (seqRef.current === seq) seqRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const seq = seqRef.current;
    if (!seq) return;
    if (reduced) seq.jumpToEnd();
    else seq.play();
  }, [reduced]);
  const restart = useCallback(() => {
    const seq = seqRef.current;
    if (!seq) return;
    if (reduced) seq.jumpToEnd();
    else seq.restart();
  }, [reduced]);
  const pause = useCallback(() => seqRef.current?.pause(), []);
  const step = useCallback(() => seqRef.current?.stepBeat(), []);

  useKeyBinding(options.key, () => (reduced ? step() : restart()));
  useAutoplay(ref, options.autoplay, options.inViewThreshold, reduced, play);

  // Reduced motion switched on mid-run: land on the end frame, never on a half-applied one.
  useEffect(() => {
    if (!reduced) return;
    const seq = seqRef.current;
    if (seq?.state().playing) seq.jumpToEnd();
  }, [reduced]);

  return {
    ref,
    play,
    restart,
    pause,
    step,
    isPlaying: state.playing,
    progress: state.progress,
    beat: state.beat,
    beats: state.beats,
    reduced,
  };
}
