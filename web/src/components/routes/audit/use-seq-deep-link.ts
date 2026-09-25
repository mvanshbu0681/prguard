"use client";
// OWNER: d4 (wave 3). `?seq=<n>` — scroll to and expand one event (dashboard-blueprint
// §2.9). <ChainRail> (t6, wave 2) exposes no imperative "scroll to and expand this row"
// API: its row ids come from an internal `useId()` the parent cannot predict, and past
// `virtualizeThreshold` rows it only renders what @tanstack/react-virtual has already
// mounted (RAISED — ChainRail could usefully grow a `focusSeq` prop; this hook is the
// workaround until it does, see 'raised'). What IS public and stable is `data-seq` on
// each row's <li> (ChainRail.tsx `ChainRow`) and the scroll container's own
// `.overflow-y-auto` div once the rail virtualizes.
//
// The approach: poll for the row. If it is not mounted yet (deep in a virtualized
// window), nudge the scroll container toward an estimated position — a fraction of
// `scrollHeight`, which already reflects the virtualizer's own total-size estimate, so
// no assumption about row height is needed here — and poll again. Once the row exists,
// scroll it into view and, if it is not already expanded, click its own toggle button
// (the same affordance a visitor's click uses; this never reaches into ChainRail's
// state).
import { useEffect, useRef } from "react";

const MAX_ATTEMPTS = 40;
const POLL_MS = 40;

export interface UseSeqDeepLinkOptions {
  /** The ChainRail instance's own wrapping element. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** The `seq` to focus, or `null`/`undefined` when there is no deep link. */
  seq: number | null | undefined;
  /** True once the data holding `seq` (if it exists) has finished loading — avoids
   *  polling against a still-empty rail. */
  ready: boolean;
}

/** Best-effort: scrolls the row for `seq` into view and expands it once, if found. */
export function useSeqDeepLink({ containerRef, seq, ready }: UseSeqDeepLinkOptions): void {
  const handledSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || seq == null || handledSeq.current === seq) return;
    let attempt = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function tick() {
      if (cancelled) return;
      const root = containerRef.current;
      const row = root?.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
      if (row) {
        handledSeq.current = seq!;
        row.scrollIntoView({ block: "center" });
        const toggle = row.querySelector<HTMLButtonElement>("button[aria-expanded]");
        if (toggle && toggle.getAttribute("aria-expanded") === "false") toggle.click();
        return;
      }
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS || !root) return;
      const scroller = root.querySelector<HTMLElement>(".overflow-y-auto") ?? root;
      // Nudge toward the end of the visible window each attempt — the seq a link points
      // at is almost always the most recently loaded event (the tamper demo, or a
      // finding's own audit trail), so a monotonic downward nudge converges quickly
      // without needing to know which direction the target sits in.
      if (scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop = Math.min(scroller.scrollTop + scroller.clientHeight * 0.8, scroller.scrollHeight);
      }
      timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [containerRef, seq, ready]);
}
