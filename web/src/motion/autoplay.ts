// OWNER: T3 (wave 1). Autoplay for useReplay / useSequence. Internal.
//
// Autoplay NEVER gates visibility: the set-piece is already rendered in its end
// frame (the static frame), and autoplay only restarts it from t = 0.
//   "none"     never (the default): a key or a control plays it
//   "mount"    once, after document.fonts.ready (motion spec §4.6.1)
//   "in-view"  once, the first time the root is `threshold` visible (plan A4)
// Under reduced motion autoplay does nothing: the end frame stays.

import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { onceInView } from "./in-view";

export type Autoplay = "none" | "mount" | "in-view";

export const DEFAULT_IN_VIEW_THRESHOLD = 0.35;

export function useAutoplay(
  ref: RefObject<Element | null>,
  mode: Autoplay | undefined,
  threshold: number | undefined,
  reduced: boolean,
  play: () => void,
): void {
  const run = useEffectEvent(play);
  const played = useRef(false);
  useEffect(() => {
    if (!mode || mode === "none" || reduced || played.current) return;
    let cancelled = false;
    const fire = () => {
      if (cancelled || played.current) return;
      played.current = true;
      run();
    };
    if (mode === "mount") {
      const ready = typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
      ready.then(fire, fire);
      return () => {
        cancelled = true;
      };
    }
    const el = ref.current;
    if (!el) return;
    const stop = onceInView(el, fire, { threshold: threshold ?? DEFAULT_IN_VIEW_THRESHOLD, rootMargin: "0px" });
    return () => {
      cancelled = true;
      stop();
    };
  }, [mode, reduced, threshold, ref]);
}
