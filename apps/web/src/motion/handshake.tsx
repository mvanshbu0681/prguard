// OWNER: T3 (wave 1). The fallback handshake: design §4.7, motion spec §3.5.
// "Degraded, never invisible." (brand-gaps §D, fixed copy.)
//
// app/layout.tsx renders <AnimHandshake /> inside <head>. It is CSS only (no inline
// script, so nothing for React to warn about and nothing to hydrate):
//
//   [data-anim]                                hidden, with a 0s animation that turns it
//                                              visible 1600ms after it renders (forwards)
//   html:not(.anim-ready)                      the page clock: at 1600ms it sets
//                                              --prg-forced: visible, which every
//                                              [data-anim] element inherits
//   html.anim-ready [data-anim]                a runtime loaded: both timers are disarmed
//   html.anim-ready [data-anim][data-anim-in]  revealed (animated by .reveal / .draw in
//                                              src/styles/motion.css, or "static")
//   <noscript>                                 JS disabled: nothing is ever hidden
//   @media print                               nothing is ever hidden
//
// Two timers because one is not enough. The per-element timer is design §4.7 verbatim,
// but an element's CSS animation only starts when the element renders, and
// content-visibility: auto (motion spec §6.3: sections 04–09) skips rendering
// off-screen subtrees: their timers sit at 0 until a judge scrolls there. The page clock
// runs on <html>, which always renders, so at 1600ms after first paint every [data-anim]
// element is visible, rendered yet or not. So if every script fails (a bundle 404 on
// venue wifi), [data-anim] content is in its final state by t = 1600ms, everywhere.
//
// markAnimReady() is called by the runtime entries ONLY after GSAP (src/motion/gsap.ts:
// the first ticker frame after <GsapRuntime /> or a useReplay mounted) or Motion
// (src/motion/motion.tsx: the features chunk loaded, then one frame) actually ran, and
// always after hydration, because it writes attributes on server-rendered elements.
//
// A late runtime never flashes content. In the same task that disarms the timers,
// markAnimReady() marks every pending [data-anim] element that is visible right now
// data-anim-in="static", so it stays exactly as it is; the rest are handed to the
// revealer (./reveal), which reveals every [data-anim] element in the document,
// including ones mounted later, as it scrolls into view. Components never wire a reveal.
//
// This module is imported by the root layout (a server component): it must never import
// React hooks or anything with browser side effects at module scope.

import { ANIM_READY_CLASS, ANIM_RUNTIME_ATTR } from "./attrs";
import { PENDING_SELECTOR, showStatic, startAutoReveal } from "./reveal";

export {
  ANIM_ATTR,
  ANIM_IN_ATTR,
  ANIM_IN_STATIC,
  ANIM_PROPS,
  ANIM_READY_CLASS,
  ANIM_RUNTIME_ATTR,
  FORCED_VAR,
  FORCE_REVEAL_KEYFRAME,
  FORCE_REVEAL_MS,
  FORCE_REVEAL_PAGE_KEYFRAME,
} from "./attrs";

/**
 * The inline stylesheet, byte for byte what the browser receives. Written out literally
 * (not assembled from the ./attrs constants, which a unit test holds equal) so that
 * `npm run motion:lint` reads the real selectors and keyframe names.
 */
export const HANDSHAKE_CSS = [
  "[data-anim]{visibility:var(--prg-forced,hidden);animation:prg-force-reveal 0s 1600ms forwards}",
  "@keyframes prg-force-reveal{to{visibility:visible}}",
  "html:not(.anim-ready){animation:prg-force-reveal-page 0s 1600ms forwards}",
  "@keyframes prg-force-reveal-page{to{--prg-forced:visible}}",
  "html.anim-ready [data-anim]{animation:none}",
  "html.anim-ready [data-anim][data-anim-in]{visibility:visible}",
  "@media print{[data-anim]{visibility:visible!important;animation:none!important}}",
].join("");

/** The <noscript> override: with JS disabled nothing is ever hidden. */
export const NOSCRIPT_CSS = "[data-anim]{visibility:visible!important;animation:none!important}";

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
export type AnimReadyState = "pending" | "ready";

export interface AnimReady {
  /** The runtime that disarmed the handshake, when the caller named it. */
  runtime: AnimRuntime | null;
  /** performance.now() at the moment it was disarmed (ms since navigation start). */
  at: number;
  /** [data-anim] elements already visible (force-revealed): kept as they are, never re-hidden. */
  kept: number;
}

type ReadyListener = (ready: AnimReady) => void;
const listeners = new Set<ReadyListener>();
let info: AnimReady | null = null;

const pageNow = () => (typeof performance !== "undefined" ? performance.now() : 0);

/** Pending until a runtime disarms the handshake; the class on <html> is the source of truth. */
export function animReadyState(): AnimReadyState {
  if (typeof document === "undefined") return "pending";
  return document.documentElement.classList.contains(ANIM_READY_CLASS) ? "ready" : "pending";
}

/** What markAnimReady() recorded, or null before it ran (lab readouts). */
export function animReadyInfo(): AnimReady | null {
  return animReadyState() === "ready" ? info : null;
}

/**
 * True when `el` is visible right now: one of the two force-reveal timers has fired
 * (or something else shows it). Read in the same task that disarms the timers, so no
 * frame can paint between the answer and the decision.
 */
export function isShowing(el: Element): boolean {
  return typeof getComputedStyle === "function" && getComputedStyle(el).visibility === "visible";
}

/**
 * Disarm the force-reveal. Call ONLY from a runtime entry, after the runtime has
 * loaded and a first frame ran (gsap.ts and motion.tsx do; nothing else should).
 * Idempotent: the first call per document decides, later calls return null.
 */
export function markAnimReady(runtime?: AnimRuntime): AnimReady | null {
  if (typeof document === "undefined") return null;
  const html = document.documentElement;
  if (html.classList.contains(ANIM_READY_CLASS)) return null;
  const at = pageNow();
  let kept = 0;
  document.querySelectorAll(PENDING_SELECTOR).forEach((el) => {
    if (!isShowing(el)) return;
    showStatic(el);
    kept++;
  });
  // Same task as the static marks above: no frame can paint between them.
  html.classList.add(ANIM_READY_CLASS);
  if (runtime) html.setAttribute(ANIM_RUNTIME_ATTR, runtime);
  startAutoReveal();
  const ready: AnimReady = { runtime: runtime ?? null, at, kept };
  info = ready;
  listeners.forEach((listener) => listener(ready));
  return ready;
}

/** Observe the first markAnimReady() (lab readouts, tests). Returns an unsubscribe. */
export function onAnimReady(listener: ReadyListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
