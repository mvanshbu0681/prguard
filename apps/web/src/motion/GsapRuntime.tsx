"use client";
// OWNER: T3 (wave 1). Mount once in the marketing layout (app/(marketing)/layout.tsx):
//
//   <GsapRuntime />
//
// Loads the GSAP entry (registration, see ./gsap), disarms the fallback handshake on the
// first GSAP frame after hydration, and on every client-side route change sweeps the
// ScrollTriggers orphaned by the old page and refreshes the rest (start positions depend
// on the new page's height). Renders nothing.
//
// Without it (or a useReplay on the page) the handshake is never disarmed and every
// [data-anim] element force-reveals at 1600ms: degraded, never invisible.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { disarmHandshakeOnNextFrame, ensureGsap, ScrollTrigger, sweepScrollTriggers } from "./gsap";

export function GsapRuntime(): null {
  const pathname = usePathname();
  useEffect(() => {
    disarmHandshakeOnNextFrame();
  }, []);
  useEffect(() => {
    if (!ensureGsap()) return;
    const id = requestAnimationFrame(() => {
      sweepScrollTriggers();
      ScrollTrigger.refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
