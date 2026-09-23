// OWNER: T3 (wave 1). useReplay: the paused-timeline-first primitive for marketing
// set-pieces (motion spec §4.6, BLAST DOOR graft 5). MARKETING ONLY: it runs on
// GSAP (./gsap). Dashboard code and components that also render on the dashboard
// use useSequence (re-exported below, engine-free) or take `progress` from the route.
//
//   const { ref, play, isPlaying } = useReplay<HTMLDivElement>((tl, { q, flip, retrigger, beat, reduced }) => {
//     if (!reduced) tl.fromTo(q("[data-scan]"), { y: 0 }, { y: 420, duration: DUR_S.scan, ease: EASE.mass.gsap }, 0);
//     tl.fromTo(q("[data-rail=a]"), { scaleY: 0 }, { scaleY: 1, duration: DUR_S.enter, ease: EASE.instrument.gsap }, 0.4);
//     beat("rails", 0.82);
//     flip(q("[data-verdict]"), "data-state", "not_attempted", "proven", 2.2);  // 0ms colour
//     retrigger(q("[data-verdict]"), "data-stamp", 2.2);                       // 180ms scale
//     beat("verdict", 2.52);
//     tl.to({}, { duration: 4 });                                                // the hold
//   }, { key: "p" });
//   <div ref={ref}>…the END frame, server-rendered…
//     <span className="stamp" data-stamp="rest" data-verdict data-state="proven">PROVEN</span>
//   </div>
//
// DESTRUCTURE the result, as above. Writing `ref={replay.ref}` makes the React Compiler
// lint (react-hooks/refs) treat the whole `replay` object as a ref, and every later
// `replay.isPlaying` read during render becomes an error.
//
// Semantics:
// - Built paused, then parked on its last frame: the server-rendered end state IS
//   the resting state (§0 rule 1). Nothing plays on load unless autoplay says so,
//   and autoplay never gates visibility.
// - key: restarts from t = 0, frame-identically, every time (P / D / R). Ignored
//   while typing and with any modifier (./keys).
// - Reduced motion (OS or data-motion="reduced"): play()/restart()/autoplay jump to
//   the end frame; the key steps beat by beat (the timeline's labels, via beat()),
//   seeking with zero tweening and firing no callbacks (§5). `build` receives
//   `reduced` so purely decorative tweens (the scan line) can be left out.
// - Positions and durations are GSAP seconds: use DUR_S and EASE[…].gsap from ./tokens.
// - Everything is created inside useGSAP, so unmount and route changes revert it.

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useAutoplay, type Autoplay } from "./autoplay";
import { gsap, ScrollTrigger, useGSAP } from "./gsap";
import { useKeyBinding, type KeySpec } from "./keys";
import { useReducedMotion } from "./reduced";
import { retrigger as retriggerEl, type RetriggerAttr } from "./stamp";

// The engine-free sibling, for the dashboard and shared components.
export { useSequence, createSequencer } from "./useSequence";
export type { Sequence, SequenceOptions, SequenceStep } from "./useSequence";

type Targets = gsap.TweenTarget;

export interface ReplayApi<T extends Element> {
  /** The ref'd root. Selector strings in tweens are scoped to it. */
  root: T;
  /** Scoped query: q("[data-row]") → matching elements inside root. */
  q: (selector: string) => Element[];
  /** Reduced motion: leave out decorative tweens. The timeline is only ever seeked, never played. */
  reduced: boolean;
  /** A 0ms state change at `at` seconds: `attr` reads `from` before and `to` after. Rewinds cleanly. */
  flip(target: Targets, attr: string, from: string, to: string, at: number): void;
  /** Restart a CSS helper (.stamp / .draw / .scan) as the playhead passes `at`. Seeks never fire it. */
  retrigger(target: Element | ArrayLike<Element> | null | undefined, attr: RetriggerAttr, at: number): void;
  /** A beat: under reduced motion each key press seeks to the next one. Put it where the beat has settled. */
  beat(name: string, at: number): void;
}

export type ReplayBuild<T extends Element> = (tl: gsap.core.Timeline, api: ReplayApi<T>) => void;

export interface ReplayOptions {
  /** Key(s) that restart the replay (P, D, R …). */
  key?: KeySpec;
  /** Default "none". "mount" waits for document.fonts.ready; "in-view" plays once on first entry. */
  autoplay?: Autoplay;
  /** For "in-view": the visible fraction that starts it (default 0.35). */
  inViewThreshold?: number;
  /** Fires when a run reaches its end (including a reduced-motion jump or the last beat). */
  onEnd?: () => void;
  /** Update `progress` and `beat` every frame while playing (re-renders the caller per frame; off by default). */
  trackProgress?: boolean;
  /** Rebuild the timeline when these change (layout-derived positions, data). Keep the length stable. */
  dependencies?: unknown[];
  /**
   * Optionally drive the same paused timeline from scroll (the D2 scrub is one line:
   * `scroll: { start: "top top", end: "+=220%", scrub: 0.5 }`). Never attached under reduced motion.
   */
  scroll?: Omit<ScrollTrigger.Vars, "animation">;
}

export interface Replay<T extends Element> {
  ref: RefObject<T | null>;
  /** Resume if paused mid-run, else restart. Reduced motion: jump to the end frame. */
  play(): void;
  /** Run from t = 0. Reduced motion: jump to the end frame. */
  restart(): void;
  pause(): void;
  /** Seek to the next beat with no tweening (what the key does under reduced motion). */
  step(): void;
  isPlaying: boolean;
  /** 0…1. Discrete (start / pause / end) unless `trackProgress`. At rest: 1. */
  progress: number;
  /** Beats reached / beats defined, for "beat 3 / 5" readouts. At rest: beats / beats. */
  beat: number;
  beats: number;
  reduced: boolean;
  /** The live timeline, for advanced wiring. Null before mount. */
  timeline(): gsap.core.Timeline | null;
}

interface ReplayState {
  isPlaying: boolean;
  progress: number;
  beat: number;
  beats: number;
}

const EPSILON = 1e-4;

/** Beat stop points: label times after 0, ascending; the end if there are no labels. */
function stopsOf(tl: gsap.core.Timeline): number[] {
  const times = [...new Set(Object.values(tl.labels).filter((t) => t > EPSILON))].sort((x, y) => x - y);
  return times.length ? times : [tl.duration()];
}

export function useReplay<T extends HTMLElement = HTMLElement>(build: ReplayBuild<T>, options: ReplayOptions = {}): Replay<T> {
  const ref = useRef<T | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const reduced = useReducedMotion();
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const [state, setState] = useState<ReplayState>({ isPlaying: false, progress: 1, beat: 0, beats: 0 });

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const tl = gsap.timeline({ paused: true });
      const q = gsap.utils.selector(root) as (selector: string) => Element[];
      const api: ReplayApi<T> = {
        root,
        q,
        reduced,
        flip(target, attr, from, to, at) {
          // immediateRender must stay true: a zero-duration fromTo built without it never
          // restores `from` when the playhead rewinds (verified against gsap 3.15). The
          // from-value it renders now is overwritten below, in this same task, when the
          // timeline parks on its end frame, so no frame paints it.
          tl.fromTo(target, { attr: { [attr]: from } }, { attr: { [attr]: to }, duration: 0, immediateRender: true }, at);
        },
        retrigger(target, attr, at) {
          if (!target) return;
          const list: Element[] = target instanceof Element ? [target] : Array.from(target);
          tl.call(() => list.forEach((el) => retriggerEl(el, attr)), undefined, at);
        },
        beat(name, at) {
          tl.addLabel(name, at);
        },
      };
      build(tl, api);
      const stops = stopsOf(tl);
      const beats = stops.length;
      tl.eventCallback("onComplete", () => {
        setState({ isPlaying: false, progress: 1, beat: beats, beats });
        optionsRef.current.onEnd?.();
      });
      if (optionsRef.current.trackProgress) {
        tl.eventCallback("onUpdate", () => {
          const progress = tl.progress();
          const now = tl.time();
          const beat = stops.filter((t) => t <= now + EPSILON).length;
          setState((s) => (s.progress === progress && s.beat === beat ? s : { ...s, progress, beat }));
        });
      }
      // Park on the end frame: the static frame and the end state are the same frame.
      tl.progress(1, true);
      tlRef.current = tl;
      setState({ isPlaying: false, progress: 1, beat: beats, beats });

      const scroll = optionsRef.current.scroll;
      const st = scroll && !reduced ? ScrollTrigger.create({ trigger: root, ...scroll, animation: tl }) : null;
      return () => {
        st?.kill();
        if (tlRef.current === tl) tlRef.current = null;
      };
    },
    { scope: ref, dependencies: [reduced, ...(options.dependencies ?? [])], revertOnUpdate: true },
  );

  const toEnd = useCallback((tl: gsap.core.Timeline) => {
    tl.pause();
    tl.progress(1, true);
    const beats = stopsOf(tl).length;
    setState({ isPlaying: false, progress: 1, beat: beats, beats });
    optionsRef.current.onEnd?.();
  }, []);

  const restart = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (reduced) return toEnd(tl);
    tl.restart(); // suppresses callbacks at the jump, then plays forward from t = 0
    setState((s) => ({ ...s, isPlaying: true, progress: 0, beat: 0 }));
  }, [reduced, toEnd]);

  const play = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (reduced) return toEnd(tl);
    if (tl.isActive()) return;
    const p = tl.progress();
    if (tl.paused() && p > EPSILON && p < 1 - EPSILON) {
      tl.play();
      setState((s) => ({ ...s, isPlaying: true }));
    } else restart();
  }, [reduced, toEnd, restart]);

  const pause = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.pause();
    setState((s) => ({ ...s, isPlaying: false, progress: tl.progress() }));
  }, []);

  const step = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.pause();
    const stops = stopsOf(tl);
    const now = tl.time();
    const atEnd = tl.progress() >= 1 - EPSILON || now >= stops[stops.length - 1] - EPSILON;
    const next = atEnd ? stops[0] : (stops.find((t) => t > now + EPSILON) ?? stops[stops.length - 1]);
    tl.seek(next, true); // zero tweening, no callbacks
    const index = stops.indexOf(next) + 1;
    setState({ isPlaying: false, progress: tl.progress(), beat: index, beats: stops.length });
    if (index === stops.length) optionsRef.current.onEnd?.();
  }, []);

  useKeyBinding(options.key, () => (reduced ? step() : restart()));
  useAutoplay(ref, options.autoplay, options.inViewThreshold, reduced, play);

  const timeline = useCallback(() => tlRef.current, []);

  return {
    ref,
    play,
    restart,
    pause,
    step,
    isPlaying: state.isPlaying,
    progress: state.progress,
    beat: state.beat,
    beats: state.beats,
    reduced,
    timeline,
  };
}
