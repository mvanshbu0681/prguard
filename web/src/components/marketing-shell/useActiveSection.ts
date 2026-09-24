"use client";
// OWNER: t8a (wave 3). Scrollspy for the nav's live section index (design
// §3.1): "updates on section crossing with a 0ms text swap — no fade."
//
// One IntersectionObserver for the whole page, never one per section (the
// same discipline as T3's ScrollTrigger.batch / MutationObserver revealer).
// `rootMargin` pulls the trigger line just under the fixed 56px header, and
// stops it 55% short of the viewport bottom, so "active" means "the section
// whose band is under the header right now" rather than "barely visible at
// the bottom edge". Ties (two sections both fully out of view during a fast
// scroll) keep the previous active id rather than falling back to the first.
import { useEffect, useState } from "react";

export interface UseActiveSectionOptions {
  /** Default: "-56px 0px -55% 0px" — 56px is the nav's fixed height. */
  rootMargin?: string;
}

export function useActiveSection(ids: readonly string[], options: UseActiveSectionOptions = {}): string {
  const { rootMargin = "-56px 0px -55% 0px" } = options;
  const [active, setActive] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const id of ids) {
          const ratio = ratios.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId) setActive(bestId);
      },
      { rootMargin, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, rootMargin]);

  return active;
}
