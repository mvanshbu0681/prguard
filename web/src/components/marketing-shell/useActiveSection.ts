"use client";
// OWNER: t8a (wave 3). Scrollspy for the nav's live section index (design
// §3.1): "updates on section crossing with a 0ms text swap — no fade."
//
// One IntersectionObserver for the whole page, never one per section (the
// same discipline as T3's ScrollTrigger.batch / MutationObserver revealer).
// `rootMargin` collapses the observed band to a THIN strip just under the
// fixed 56px header (56px to ~10% of the viewport) rather than a tall one:
// a tall band would leave several sections touching it at once whenever
// they are each shorter than the band (every _sections/** stub today,
// before wave 3 fills them in — with only 9 short stubs the whole page can
// fit in one screen, so a tall band spans most of it), and "last one
// touching" would then report the LAST short section in view rather than
// the one actually sitting under the header. A strip this thin is touched
// by at most the one (or two, mid-crossing) sections actually under the
// header regardless of how tall any section is. Active is the LAST id (in
// document order) currently touching it; with none touching it (a fast
// scroll skipped the crossing in one frame), the previous active id is kept
// rather than snapping back to the first section.
import { useEffect, useState } from "react";

export interface UseActiveSectionOptions {
  /** Default: "-56px 0px -90% 0px" — 56px is the nav's fixed height. */
  rootMargin?: string;
}

export function useActiveSection(ids: readonly string[], options: UseActiveSectionOptions = {}): string {
  const { rootMargin = "-56px 0px -90% 0px" } = options;
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
