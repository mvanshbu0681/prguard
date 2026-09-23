// OWNER: T3 (wave 1). The fallback handshake: design §4.7, motion spec §3.5.
// "Degraded, never invisible." (brand-gaps §D, fixed copy.)
//
// app/layout.tsx renders <AnimHandshake /> inside <head>. It is CSS only (no inline
// script, so nothing for React to warn about and nothing to hydrate):
//
//   [data-anim]                                hidden, with a 0s animation that turns it
//                                              visible at 1600ms (fill: forwards)
//   html.anim-ready [data-anim]                a runtime loaded: the timer is disarmed
//   html.anim-ready [data-anim][data-anim-in]  revealed (animated by .reveal / .draw in
//                                              src/styles/motion.css, or "static")
//   <noscript>                                 JS disabled: nothing is ever hidden
//   @media print                               nothing is ever hidden
//
// So if every script fails (a bundle 404 on venue wifi), [data-anim] content appears in
// its final state at t = 1600ms. markAnimReady() is called by the runtime entries ONLY
// after GSAP (src/motion/gsap.ts: the first ticker frame after <GsapRuntime /> or a
// useReplay mounted) or Motion (src/motion/motion.tsx: the features chunk loaded, then
// one frame) actually ran, and always after hydration, because it writes attributes on
// server-rendered elements.
//
// A late runtime never flashes content. markAnimReady() checks every pending
// [data-anim] element's own force-reveal: one that already fired (or is within
// FIRED_MARGIN_MS of firing) is marked data-anim-in="static" and stays exactly as it
// is; the rest are disarmed and handed to the revealer (./reveal), which reveals every
// [data-anim] element in the document, including ones mounted later, as it scrolls
// into view. Components never wire a reveal themselves.
//
// This module is imported by the root layout (a server component): it must never
// import React hooks or anything with browser side effects at module scope.

import {
  ANIM_READY_CLASS,
  ANIM_RUNTIME_ATTR,
  FIRED_MARGIN_MS,
  FORCE_REVEAL_KEYFRAME,
  FORCE_REVEAL_MS,
  ANIM_ATTR,
  ANIM_IN_ATTR,
} from "./attrs";
import { PENDING_SELECTOR, showStatic, startAutoReveal } from "./reveal";

export {
  ANIM_ATTR,
  ANIM_IN_ATTR,
  ANIM_IN_STATIC,
  ANIM_PROPS,
  ANIM_READY_CLASS,
  ANIM_RUNTIME_ATTR,
  FIRED_MARGIN_MS,
  FORCE_REVEAL_KEYFRAME,
  FORCE_REVEAL_MS,
} from "./attrs";

/** The inline stylesheet, byte for byte what the browser receives. */
export const HANDSHAKE_CSS = [
  `[${ANIM_ATTR}]{visibility:hidden;animation:${FORCE_REVEAL_KEYFRAME} 0s ${FORCE_REVEAL_MS}ms forwards}`,
  `@keyframes ${FORCE_REVEAL_KEYFRAME}{to{visibility:visible}}`,
  `html.${ANIM_READY_CLASS} [${ANIM_ATTR}]{animation:none}`,
  `html.${ANIM_READY_CLASS} [${ANIM_ATTR}][${ANIM_IN_ATTR}]{visibility:visible}`,
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
export type AnimReadyState = "pending" | "ready";

export interface AnimReady {
  /** The runtime that disarmed the handshake, when the caller named it. */
  runtime: AnimRuntime | null;
  /** performance.now() at the moment it was disarmed (ms since navigation start). */
  at: number;
  /** [data-anim] elements whose force-reveal had already fired: kept visible, never re-hidden. */
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
 * True when `el`'s force-reveal has fired or is about to: it is (or is a frame from
 * being) visible, so it must be shown statically rather than hidden for a reveal.
 * Without the Web Animations API it falls back to the page clock, which is
 * conservative: an element's timer never starts before navigation does.
 */
export function forceRevealFired(el: Element, now: number = pageNow()): boolean {
  if (typeof el.getAnimations !== "function") return now >= FORCE_REVEAL_MS - FIRED_MARGIN_MS;
  const timer = el.getAnimations().find((a) => (a as CSSAnimation).animationName === FORCE_REVEAL_KEYFRAME);
  if (!timer) return false; // not rendered (display: none, a closed <details>): the revealer shows it when it appears
  if (timer.playState === "finished") return true;
  return Number(timer.currentTime ?? 0) >= FORCE_REVEAL_MS - FIRED_MARGIN_MS;
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
    if (!forceRevealFired(el, at)) return;
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
