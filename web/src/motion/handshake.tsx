// OWNER: T3 (wave 1). The fallback handshake: design §4.7, motion spec §3.5.
// "Degraded, never invisible." (brand-gaps §D, fixed copy.)
//
// app/layout.tsx renders <AnimHandshake /> inside <head>. It is CSS only (no inline
// script, so there is nothing for React to warn about and nothing to hydrate):
//
//   [data-anim]                      visibility: hidden, plus a 0s animation that
//                                    turns it visible at 1600ms (forwards)
//   html.anim-ready [data-anim]      the runtime loaded: the timer is disarmed and the
//                                    runtime owns the reveal
//   html.anim-ready [data-anim][data-anim-in]   revealed by the runtime
//   html.anim-late [data-anim]       the runtime arrived after the timer fired: stay
//                                    static and visible (no flash back to hidden)
//   <noscript>                       JS disabled: everything visible, no timer
//   @media print                     everything visible
//
// So if every script fails (bundle 404 on venue wifi), [data-anim] content appears
// in its final state at t = 1600ms. `markAnimReady()` is called by the runtime
// entries ONLY after GSAP (src/motion/gsap.ts: first gsap.ticker tick) or Motion
// (src/motion/motion.tsx: features chunk loaded + one frame) actually ran.
//
// Usage rule: [data-anim] goes on elements whose FIRST appearance the runtime
// animates (scroll reveals, draws). Never on the hero, the <h1>, or anything a judge
// must read in the first three seconds: those render in their final state at frame 0
// (motion spec §4.4.1). Do not nest [data-anim] (a revealed child would show through
// a hidden parent). Reveal with src/motion/reveal.ts (engine-free) or revealBatch()
// in src/motion/gsap.ts; both set `data-anim-in`.

import { HANDSHAKE } from "./tokens";

/** Content is never invisible for longer than this, even if every script fails. */
export const FORCE_REVEAL_MS = HANDSHAKE.forceRevealMs;

/** The attribute that marks an element whose first appearance the runtime animates. */
export const ANIM_ATTR = "data-anim";
/** Set by the runtime to reveal a [data-anim] element. */
export const ANIM_IN_ATTR = "data-anim-in";
/** Classes written on <html>. */
export const ANIM_READY_CLASS = "anim-ready";
export const ANIM_LATE_CLASS = "anim-late";

/** Spread onto an element: `<div {...ANIM_PROPS} className="reveal">`. */
export const ANIM_PROPS = { [ANIM_ATTR]: "" } as const;

/**
 * If the runtime is ready later than this, the timer may already have fired (or will
 * fire before the class applies), so the page is marked late instead of ready. The
 * margin covers the frame between writing the class and the style recalc.
 */
export const LATE_MARGIN_MS = 100;

/** The inline stylesheet, byte-for-byte what the browser receives. */
export const HANDSHAKE_CSS = [
  `[${ANIM_ATTR}]{visibility:hidden;animation:prg-force-reveal 0s ${FORCE_REVEAL_MS}ms forwards}`,
  `@keyframes prg-force-reveal{to{visibility:visible}}`,
  `html.${ANIM_READY_CLASS} [${ANIM_ATTR}]{animation:none}`,
  `html.${ANIM_READY_CLASS} [${ANIM_ATTR}][${ANIM_IN_ATTR}]{visibility:visible}`,
  `html.${ANIM_LATE_CLASS} [${ANIM_ATTR}]{visibility:visible;animation:none}`,
  `@media print{[${ANIM_ATTR}]{visibility:visible!important;animation:none!important}}`,
].join("");

/** The <noscript> override: with JS disabled nothing is ever hidden. */
export const NOSCRIPT_CSS = `[${ANIM_ATTR}]{visibility:visible!important;animation:none!important}`;

/** Render inside <head> (app/layout.tsx does). Server-safe, no client JS. */
export function AnimHandshake() {
  return (
    <>
      <style id="prg-anim-handshake" dangerouslySetInnerHTML={{ __html: HANDSHAKE_CSS }} />
      <noscript dangerouslySetInnerHTML={{ __html: `<style>${NOSCRIPT_CSS}</style>` }} />
    </>
  );
}

export type AnimRuntime = "gsap" | "motion";
export type AnimReadyState = "pending" | "ready" | "late";

type ReadyListener = (state: AnimReadyState, runtime: AnimRuntime) => void;
const readyListeners = new Set<ReadyListener>();

/** Where the handshake stands on this document: pending, ready (runtime owns reveals) or late (static). */
export function animReadyState(): AnimReadyState {
  if (typeof document === "undefined") return "pending";
  const cl = document.documentElement.classList;
  if (cl.contains(ANIM_READY_CLASS)) return "ready";
  if (cl.contains(ANIM_LATE_CLASS)) return "late";
  return "pending";
}

/**
 * Disarm the force-reveal. Call ONLY from a runtime entry, after the runtime has
 * loaded and a first frame ran (gsap.ts and motion.tsx do; nothing else should).
 * Idempotent: the first call per document decides.
 *
 * Returns "ready" when the runtime now owns reveals, or "late" when the 1600ms timer
 * could already have fired: the page then stays static, so content that became
 * visible never flashes back to hidden.
 */
export function markAnimReady(runtime: AnimRuntime): AnimReadyState {
  const current = animReadyState();
  if (typeof document === "undefined" || current !== "pending") return current;
  const html = document.documentElement;
  const now = typeof performance !== "undefined" ? performance.now() : Number.POSITIVE_INFINITY;
  const state: AnimReadyState = now < FORCE_REVEAL_MS - LATE_MARGIN_MS ? "ready" : "late";
  html.classList.add(state === "ready" ? ANIM_READY_CLASS : ANIM_LATE_CLASS);
  html.setAttribute("data-anim-runtime", runtime);
  readyListeners.forEach((l) => l(state, runtime));
  return state;
}

/** Observe the first markAnimReady() (lab readouts, tests). */
export function onAnimReady(listener: ReadyListener): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}
