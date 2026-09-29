"use client";
// `?seq=<n>` — scroll one event into view. The page owns the expansion and the
// highlight (the block for `seq` renders expanded and ringed); this hook only waits
// for that block to mount — it may be deep in the windowed log, or its page may
// still be loading — then scrolls it to the top of the scroller and moves focus
// to its toggle (without a second scroll), so a keyboard user lands on it too.
import { useEffect, useRef } from "react";

const MAX_ATTEMPTS = 60;
const POLL_MS = 50;

export interface UseSeqDeepLinkOptions {
  /** The element that contains every rendered block. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** The `seq` to focus, or null when there is no deep link. */
  seq: number | null | undefined;
  /** True once the data that would hold `seq` has loaded. */
  ready: boolean;
  /** Bump to scroll to the same `seq` again (a second "Show #n" click). */
  nonce?: number;
}

export function useSeqDeepLink({ containerRef, seq, ready, nonce = 0 }: UseSeqDeepLinkOptions): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const key = `${seq}:${nonce}`;
    if (!ready || seq == null || handled.current === key) return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const row = containerRef.current?.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
      if (row) {
        handled.current = key;
        const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // "start" (with the block's scroll-margin clearing the glass top bar), so an
        // expanded block taller than the viewport still shows its head.
        row.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
        // Focus follows only a jump the visitor asked for on this page; a deep link
        // arriving from elsewhere scrolls and highlights without stealing focus.
        if (nonce > 0) row.querySelector<HTMLElement>("button[aria-expanded]")?.focus({ preventScroll: true });
        return;
      }
      attempt += 1;
      if (attempt < MAX_ATTEMPTS) timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [containerRef, seq, ready, nonce]);
}
