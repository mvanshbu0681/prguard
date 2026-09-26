// OWNER: T3 (wave 1). Reduced motion, implemented ONCE (motion spec §5): the OS
// preference `prefers-reduced-motion: reduce` and the visible footer toggle, which
// writes `data-motion="reduced"` on <html>, share this one code path. The CSS side
// lives in src/styles/motion.css (every rule is written for both triggers).
//
// Reduced motion is a designed second state, not an off switch: callers render the
// END frame, never a missing element.
//
// Engine-free. SSR renders the full-motion snapshot (false); the end frame is the
// static frame anyway, so nothing flashes on hydration.

import { useSyncExternalStore } from "react";

export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
export const MOTION_ATTR = "data-motion";
export type MotionOverride = "reduced" | null;

type Listener = () => void;
const listeners = new Set<Listener>();
let teardown: (() => void) | null = null;

function root(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(REDUCED_QUERY);
}

/** The `data-motion` override on <html> (the footer toggle), or null. */
export function getMotionOverride(): MotionOverride {
  return root()?.getAttribute(MOTION_ATTR) === "reduced" ? "reduced" : null;
}

/** True when the OS asks for reduced motion OR the page toggle is on. */
export function isReducedMotion(): boolean {
  return getMotionOverride() === "reduced" || mediaQuery()?.matches === true;
}

/** Write (or clear) the `data-motion="reduced"` override. Takes effect on the next frame, with no transition. */
export function setMotionOverride(value: MotionOverride): void {
  const el = root();
  if (!el) return;
  if (value === "reduced") el.setAttribute(MOTION_ATTR, "reduced");
  else el.removeAttribute(MOTION_ATTR);
}

function start(): () => void {
  const emit = () => listeners.forEach((l) => l());
  const mq = mediaQuery();
  mq?.addEventListener?.("change", emit);
  const el = root();
  const observer =
    el && typeof MutationObserver !== "undefined" ? new MutationObserver(emit) : null;
  if (el && observer) observer.observe(el, { attributes: true, attributeFilter: [MOTION_ATTR] });
  return () => {
    mq?.removeEventListener?.("change", emit);
    observer?.disconnect();
  };
}

/** Subscribe to changes of either trigger. One media listener and one observer are shared by all subscribers. */
export function subscribeReducedMotion(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) teardown = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown?.();
      teardown = null;
    }
  };
}

const serverFalse = () => false;
const serverNull = (): MotionOverride => null;

/** Live reduced-motion state (OS preference OR `data-motion="reduced"`). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, isReducedMotion, serverFalse);
}

/** Live value of the `data-motion` override alone (the dashboard uses it to force Motion's reducedMotion). */
export function useMotionOverride(): MotionOverride {
  return useSyncExternalStore(subscribeReducedMotion, getMotionOverride, serverNull);
}
