// OWNER: T3 (wave 1). The verdict stamp and the restartable CSS helpers.
//
// THE STAMP (motion spec §2.5, plan §2 hard rule 3). A verdict, gate or
// chain.verified change flips its colour in 0ms: `.stamp` carries NO transition at all
// (motion.css enforces it with !important, beating any utility). The only motion is
// scale(1.045) → 1 over --dur-2 (180ms) on --ease-snap. Two ways to play it:
//
//   declarative  add the class `stamp` when the verdict arrives, or re-mount the
//                element with it (a React `key` change). It plays once on insertion.
//                Leave the class off the first paint: a page load is not a verdict.
//
//   controlled   keep `stamp` on the element from the first paint and drive
//                data-stamp: "rest" never animates, and every flip between "a" and "b"
//                restarts the stamp. useStamp(value) returns exactly that value:
//
//     const stamp = useStamp(proofStatus);
//     <span className="stamp" data-stamp={stamp} data-state={proofStatus}>PROVEN</span>
//
// Reduced motion: the colour still flips at 0ms (it is not motion); the scale is dropped.
//
// .draw and .scan restart the same way (data-draw / data-scan flipping "a" ↔ "b"); with
// the attribute absent or "rest" they sit on their end frame. retrigger() is the
// imperative form for timelines (useReplay, useSequence); use one mechanism per element.
//
// Engine-free.

import { useState } from "react";
import { fitDraw } from "./draw";

export type StampAttr = "rest" | "a" | "b";
export type RetriggerAttr = "data-stamp" | "data-draw" | "data-scan";

/**
 * The data-stamp value for a controlled `.stamp` element: "rest" until `value` first
 * changes, then "a" / "b" alternating on every change, so each change restarts the
 * stamp. Derived during render (no effect, no ref), so the new colour and the stamp land
 * in the same commit.
 */
export function useStamp(value: unknown): StampAttr {
  const [seen, setSeen] = useState(value);
  const [count, setCount] = useState(0);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setCount(count + 1);
  }
  return count === 0 ? "rest" : count % 2 === 1 ? "a" : "b";
}

/**
 * Restart the helper animation on `el` (flip its attribute "a" ↔ "b"; "rest" or absent
 * → "a"). A draw is measured first (./draw), so a scaled hairline still meets its node.
 */
export function retrigger(el: Element, attr: RetriggerAttr = "data-stamp"): void {
  if (attr === "data-draw") fitDraw(el);
  el.setAttribute(attr, el.getAttribute(attr) === "a" ? "b" : "a");
}

/** Restart every matching helper inside `root`. */
export function retriggerAll(root: ParentNode, selector: string, attr: RetriggerAttr): void {
  root.querySelectorAll(selector).forEach((el) => retrigger(el, attr));
}

/**
 * Return a helper to its resting end frame. Sets "rest" rather than removing the
 * attribute: a `.stamp` without data-stamp is declarative and would stamp again.
 */
export function settle(el: Element, attr: RetriggerAttr): void {
  el.setAttribute(attr, "rest");
}
