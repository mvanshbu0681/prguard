"use client";
// OWNER: t8a (wave 3). Design §3.2: a 2px --signal-lo rail along the header's
// top edge, growing from x=0.
//
// The mechanism is a passive scroll listener + rAF — it must work in
// Firefox, and `animation-timeline: scroll()` is Baseline "limited": absent
// from Firefox stable entirely (§3.2). The `@supports` block below is
// progressive enhancement ONLY (brief, binding): where the browser supports
// scroll-driven animations it takes over the same `transform` on the same
// element (CSS animations win over an inline style), so the rAF loop keeps
// running harmlessly underneath rather than being the thing that decides
// whether the rail moves at all.
//
// Compositor contract: `transform` only, no transition (a scrub is linear by
// construction — easing it fights the scroll input, motion §1.6).
import { useEffect, useRef } from "react";

// ONE string literal (a no-substitution template, not concatenation and not
// an array joined at runtime): scripts/lint-motion.mjs statically parses each
// <style dangerouslySetInnerHTML> string as its own AST node, so the
// @supports wrapper has to be textually present, in the same node, around
// the property it guards for the "timeline outside @supports" check to see
// it that way.
const SCROLL_RAIL_CSS = `@keyframes prg-scroll-rail-scale{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@supports (animation-timeline: scroll()) {
  [data-scroll-rail]{animation:prg-scroll-rail-scale linear;animation-timeline:scroll(root block)}
}`;

export function ScrollProgress() {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${ratio})`;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-transparent">
      {/* Static keyframes/@supports, no interpolation. */}
      <style dangerouslySetInnerHTML={{ __html: SCROLL_RAIL_CSS }} />
      <div ref={railRef} data-scroll-rail className="h-full w-full origin-left bg-signal-lo" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
