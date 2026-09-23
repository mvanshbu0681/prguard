"use client";
// OWNER: T3 (wave 1). Mount once in the marketing layout (app/(marketing)/layout.tsx):
//
//   <GsapRuntime />
//
// Loads the GSAP entry (registration + handshake disarm, see ./gsap), and on every
// client-side route change sweeps ScrollTriggers orphaned by the old page and
// refreshes the rest (start positions depend on the new page's height).
// Renders nothing.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ensureGsap, ScrollTrigger, sweepScrollTriggers } from "./gsap";

export function GsapRuntime(): null {
  const pathname = usePathname();
  useEffect(() => {
    ensureGsap();
    const id = requestAnimationFrame(() => {
      sweepScrollTriggers();
      ScrollTrigger.refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
