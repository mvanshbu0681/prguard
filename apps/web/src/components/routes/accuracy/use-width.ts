"use client";
// The rendered width of a chart's box, so an inline SVG draws at real pixels
// (crisp hairlines, 11px axis text that stays 11px) instead of scaling a
// viewBox. Falls back to `fallback` until the first measure (and under jsdom,
// whose layout is always 0).
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
