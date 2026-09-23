// OWNER: T3 (wave 1). The MARKETING-ONLY animation entry: GSAP 3.15 + ScrollTrigger.
//
// Import GSAP through this module, never from "gsap" directly, so every timeline
// gets the registered plugins, the PRGuard eases and the handshake. GSAP never
// enters app/(app)/ or src/components/charts/ (plan §2 hard rule 2): ESLint bans
// "gsap" there and `npm run motion:lint` bans this module and useReplay there.
//
// What loading this module does, once per document and only in the browser (module
// scope, never inside an effect, so StrictMode cannot double-register; §3.3):
//   - gsap.registerPlugin(useGSAP, ScrollTrigger). The plugin set is core +
//     ScrollTrigger only (§3.1): no SplitText, ScrambleText, DrawSVG, Flip, CustomEase.
//   - ScrollTrigger.config({ ignoreMobileResize: true }).
//   - Registers the eases "instrument", "snap", "mass", "exit" as the exact CSS
//     curves (src/motion/bezier.ts), and sets gsap.defaults to --dur-4 / instrument
//     so an unspecified tween still lands on the grid. Scrubs use ease "none".
//   - document.fonts.ready → ScrollTrigger.refresh() (start positions depend on type).
//   - On the first ticker frame: markAnimReady("gsap") disarms the handshake.
//
// Cleanup: create animations inside useGSAP (re-exported here) or the hooks below;
// its gsap.context() reverts every tween and ScrollTrigger on unmount, which is what
// a client-side route change is. <GsapRuntime /> (GsapRuntime.tsx) additionally
// sweeps orphaned triggers and refreshes on every pathname change.

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";
import { easeFn } from "./bezier";
import { markAnimReady } from "./handshake";
import { getMotionOverride, REDUCED_QUERY, subscribeReducedMotion } from "./reduced";
import { revealNow } from "./reveal";
import { DUR_S, EASE } from "./tokens";

export { gsap, ScrollTrigger, useGSAP };

type PrguardGlobal = typeof globalThis & { __prguardGsap?: "ok" | "failed" };

/**
 * Register once, in the browser. Safe to call any number of times; the module calls
 * it on load. Returns false on the server, or if registration failed: then the
 * handshake is never disarmed and [data-anim] content force-reveals at 1600ms
 * (degraded, never invisible) instead of an import-time exception taking the page down.
 */
export function ensureGsap(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as PrguardGlobal;
  if (g.__prguardGsap) return g.__prguardGsap === "ok"; // also survives Fast Refresh re-evaluating this module

  for (const token of Object.values(EASE)) gsap.registerEase(token.gsap, easeFn(token.points));
  gsap.defaults({ duration: DUR_S.enter, ease: EASE.instrument.gsap });
  try {
    gsap.registerPlugin(useGSAP, ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  } catch (error) {
    g.__prguardGsap = "failed";
    if (process.env.NODE_ENV !== "production") console.warn("[motion] GSAP registration failed; [data-anim] content will force-reveal", error);
    return false;
  }
  g.__prguardGsap = "ok";

  document.fonts?.ready.then(
    () => ScrollTrigger.refresh(),
    () => {},
  );

  // "Only after the runtime actually loaded and a first frame ran" (design §4.7).
  const firstFrame = () => {
    gsap.ticker.remove(firstFrame);
    markAnimReady("gsap");
  };
  gsap.ticker.add(firstFrame);
  return true;
}

ensureGsap();

/** Media conditions for motionMedia(). */
export const MEDIA = {
  /** OS reduced motion. The html[data-motion="reduced"] toggle is folded in below. */
  reduce: REDUCED_QUERY,
  /** The pin/scrub threshold: below it timelines are never constructed (§3.3, §4.7). */
  desktop: "(min-width: 1024px)",
  /** Mobile motion budget (§6.5). */
  coarse: "(pointer: coarse)",
} as const;

export interface MotionConditions {
  /** OS preference OR the page toggle. Reduced-motion timelines should not be built at all. */
  reduced: boolean;
  desktop: boolean;
  coarse: boolean;
}

export type MotionMediaBuild = (conditions: MotionConditions, context: gsap.Context) => void | (() => void);

export interface MotionMediaHandle {
  revert(): void;
}

/**
 * gsap.matchMedia, yielding a reduced-motion context. `build` runs now and again
 * whenever a condition changes (GSAP reverts the previous run first), including the
 * html[data-motion] toggle, which a media query cannot see.
 *
 *   motionMedia(({ reduced, desktop }) => {
 *     if (reduced) return;          // the static end frame stays; nothing is built
 *     if (!desktop) { ...per-stage reveals...; return; }
 *     ...full timeline...
 *   }, scopeEl);
 */
export function motionMedia(build: MotionMediaBuild, scope?: Element | string): MotionMediaHandle {
  ensureGsap();
  let mm: gsap.MatchMedia | null = null;
  const run = () => {
    mm?.revert();
    mm = gsap.matchMedia(scope);
    // The "all" key always matches, so build runs even when no other query does.
    mm.add({ all: "all", ...MEDIA }, (context) => {
      const c = context.conditions ?? {};
      return build(
        { reduced: Boolean(c.reduce) || getMotionOverride() === "reduced", desktop: Boolean(c.desktop), coarse: Boolean(c.coarse) },
        context,
      );
    });
  };
  run();
  // Media changes are GSAP's own; re-run only when the page toggle flips.
  let override = getMotionOverride();
  const unsubscribe = subscribeReducedMotion(() => {
    const next = getMotionOverride();
    if (next === override) return;
    override = next;
    run();
  });
  return {
    revert() {
      unsubscribe();
      mm?.revert();
      mm = null;
    },
  };
}

/** motionMedia inside useGSAP: reverted on unmount and whenever `dependencies` change. */
export function useMotionMedia(
  build: MotionMediaBuild,
  config: { scope?: RefObject<Element | null>; dependencies?: unknown[] } = {},
): void {
  const { scope, dependencies = [] } = config;
  useGSAP(
    () => {
      const handle = motionMedia(build, scope?.current ?? undefined);
      return () => handle.revert();
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}

export interface RevealBatchVars {
  /** Default "top 84%" (§4.5). */
  start?: string;
  /** Seconds that collect simultaneous entries into one staggered batch. */
  interval?: number;
}

/**
 * Motion spec §4.5 through ScrollTrigger.batch: one batched trigger for every
 * [data-anim] target, once, never reversing. ScrollTrigger decides WHEN; the CSS
 * `.reveal` keyframe does the tween (opacity, --dur-enter, --ease-instrument,
 * --stagger-sibling capped at 6), so reduced motion and the handshake stay one code
 * path. Call inside useGSAP (or use useRevealBatch) so it is reverted on unmount.
 */
export function revealBatch(targets: gsap.DOMTarget, vars: RevealBatchVars = {}): ScrollTrigger[] {
  ensureGsap();
  return ScrollTrigger.batch(targets, {
    start: vars.start ?? "top 84%",
    interval: vars.interval ?? 0.1,
    once: true,
    onEnter: (batch) => batch.forEach((el, i) => revealNow(el, i)),
  });
}

/** Reveal every `selector` match inside `scope` through one ScrollTrigger.batch. */
export function useRevealBatch(scope: RefObject<Element | null>, selector = "[data-anim]", vars: RevealBatchVars = {}): void {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const targets = Array.from(root.querySelectorAll(selector));
      if (targets.length) revealBatch(targets, vars);
    },
    { scope },
  );
}

/**
 * Kill ScrollTriggers whose trigger element left the DOM: triggers created outside
 * a context (e.g. in a raw onClick without contextSafe, pitfall #4) would otherwise
 * outlive a route change. Returns how many were killed.
 */
export function sweepScrollTriggers(): number {
  let killed = 0;
  for (const st of ScrollTrigger.getAll()) {
    const el = st.trigger;
    if (el && !el.isConnected) {
      st.kill();
      killed++;
    }
  }
  return killed;
}
