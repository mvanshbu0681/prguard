// OWNER: T3 (wave 1). Reveals: an element's first appearance, engine-free.
//
// Contract with the handshake (src/motion/handshake.tsx) and motion.css:
//   <div data-anim className="reveal">   hidden until revealed (or force-revealed at 1600ms)
//   revealNow(el, i)                     sets --reveal-index = i and data-anim-in
//   motion.css .reveal                   opacity 0 → 1 (+ an optional rise of at most 8px)
//                                        on --dur-enter / --ease-instrument, delayed by
//                                        min(i, 5) × --stagger-sibling (cap: 6 items)
// Reduced motion: the same reveal at --dur-1, opacity only (motion spec §5).
// Reveals never reverse on scroll-up (§4.5).
//
// useReveal() works on both surfaces (no GSAP, no Motion). On marketing,
// revealBatch() in src/motion/gsap.ts does the same thing through ScrollTrigger.batch.

import { useCallback } from "react";
import { ANIM_IN_ATTR } from "./handshake";
import { onceInView, type InViewOptions } from "./in-view";
import { STAGGER } from "./tokens";

export const REVEAL_INDEX_VAR = "--reveal-index";

/** Reveal now. `index` is the position in its batch; the stagger is capped at 6 items. */
export function revealNow(el: Element, index = 0): void {
  const i = Math.min(Math.max(0, Math.floor(index)), STAGGER.cap - 1);
  if (el instanceof HTMLElement || el instanceof SVGElement) el.style.setProperty(REVEAL_INDEX_VAR, String(i));
  el.setAttribute(ANIM_IN_ATTR, "");
}

/**
 * Replay a reveal (lab and demo controls): hide the elements, let one style
 * recalc land, then reveal them again with fresh batch indices.
 */
export function replayReveal(elements: Iterable<Element>): void {
  const list = [...elements];
  list.forEach((el) => el.removeAttribute(ANIM_IN_ATTR));
  // Reading computed style flushes the style change so the animation restarts (a style
  // recalc, not a layout).
  list.forEach((el) => void getComputedStyle(el).animationName);
  list.forEach((el, i) => revealNow(el, i));
}

export interface UseRevealOptions extends InViewOptions {
  /** Stagger elements that enter together (default true). */
  stagger?: boolean;
}

/**
 * Callback ref: reveal the element the first time it enters the viewport.
 * `<li ref={useReveal()} data-anim="" className="reveal">`.
 */
export function useReveal<T extends Element = HTMLElement>(options: UseRevealOptions = {}): (el: T | null) => void | (() => void) {
  const { threshold, rootMargin, stagger = true } = options;
  return useCallback(
    (el: T | null) => {
      if (!el) return;
      return onceInView(el, (_entry, index) => revealNow(el, stagger ? index : 0), { threshold, rootMargin });
    },
    [threshold, rootMargin, stagger],
  );
}
