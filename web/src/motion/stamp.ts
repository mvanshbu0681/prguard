// OWNER: T3 (wave 1). Restartable CSS helpers: the verdict stamp, draws, the scan.
//
// motion.css animates `.stamp`, `.draw` and `.scan` while their data attribute is
// "a" or "b". The two values run identical keyframes under different names, so
// flipping a ↔ b restarts the animation without removing a class or forcing layout.
// With no attribute (the server render) nothing animates: the end frame is the
// static frame.
//
// The verdict stamp (motion spec §2.5, plan hard rule 3): the colour change on a
// `.stamp` element has NO transition at all (motion.css enforces it with
// !important); the only motion is scale(1.045) → 1 over 180ms on --ease-snap.
// Under reduced motion the colour still flips at 0ms and the scale is dropped.
//
// Engine-free.

import { useLayoutEffect, useRef, type RefObject } from "react";

export type RetriggerAttr = "data-stamp" | "data-draw" | "data-scan";

/** Restart the helper animation on `el` (flip its attribute a ↔ b). */
export function retrigger(el: Element, attr: RetriggerAttr = "data-stamp"): void {
  el.setAttribute(attr, el.getAttribute(attr) === "a" ? "b" : "a");
}

/** Restart every matching helper inside `root`. */
export function retriggerAll(root: ParentNode, selector: string, attr: RetriggerAttr): void {
  root.querySelectorAll(selector).forEach((el) => retrigger(el, attr));
}

/** Return a helper to its resting, non-animating state (the end frame). */
export function settle(el: Element, attr: RetriggerAttr): void {
  el.removeAttribute(attr);
}

/**
 * Stamp an element whenever `value` changes (never on the first render, so a page
 * load shows the verdict already stamped, not stamping).
 *
 *   const ref = useStamp<HTMLSpanElement>(proofStatus);
 *   <span ref={ref} className="stamp" data-state={proofStatus}>PROVEN</span>
 *
 * Colour comes from `data-state` and flips at 0ms; the ref'd element gets the scale.
 */
export function useStamp<T extends Element = HTMLElement>(value: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const previous = useRef<unknown>(value);
  useLayoutEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    if (ref.current) retrigger(ref.current, "data-stamp");
  }, [value]);
  return ref;
}
