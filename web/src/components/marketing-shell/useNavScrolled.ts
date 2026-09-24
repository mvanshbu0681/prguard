"use client";
// OWNER: t8a (wave 3). "Past 80px: gains [a] background ... over 120ms on
// --ease-snap." (design §3.1). A passive scroll listener + rAF, the same
// mechanism §3.2 requires for the scroll rail — no ScrollTrigger for a single
// boolean threshold.
import { useEffect, useState } from "react";

export function useNavScrolled(threshold = 80): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
