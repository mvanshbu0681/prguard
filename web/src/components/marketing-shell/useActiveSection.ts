"use client";
// OWNER: t8a (wave 3). Scrollspy for the nav's live section index (design
// §3.1): "updates on section crossing with a 0ms text swap — no fade."
//
// One IntersectionObserver for the whole page, never one per section (the
// same discipline as T3's ScrollTrigger.batch / MutationObserver revealer).
// `rootMargin` collapses the observed band to a thin strip just under the
// fixed 56px header (56px to 62% of the viewport), so the section that
// "owns" that strip is unambiguous regardless of how tall any one section
// is — a ratio-of-intersection comparison instead would let a short section
// (like every _sections/** stub today) lose to a merely-larger neighbour
// even while it alone sits under the header. Active is the LAST id (in
// document order) currently touching the strip; with none touching it (a
// fast scroll skipped every threshold in one frame), the previous active id
// is kept rather than snapping back to the first section.
import { useEffect, useState } from "react";

export interface UseActiveSectionOptions {
  /** Default: "-56px 0px -38% 0px" — 56px is the nav's fixed height. */
  rootMargin?: string;
}

export function useActiveSection(ids: readonly string[], options: UseActiveSectionOptions = {}): string {
  const { rootMargin = "-56px 0px -38% 0px" } = options;
  const [active, setActive] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const intersecting = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) intersecting.set(entry.target.id, entry.isIntersecting);
        let lastId: string | null = null;
        for (const id of ids) if (intersecting.get(id)) lastId = id;
        if (lastId) setActive(lastId);
      },
      { rootMargin, threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, rootMargin]);

  return active;
}
