"use client";
// OWNER: d3 (wave 3). A local media-query hook for the suppress form's
// dialog/sheet split at 1024px (brief: "a Sheet under 1024px" — a different
// line than the shell's own 768px mobile band in @/components/app-shell, so
// this is its own hook rather than a reuse of useIsMobile).
import { useSyncExternalStore } from "react";

export const SUPPRESS_SHEET_QUERY = "(max-width: 1023px)";

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(SUPPRESS_SHEET_QUERY);
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(SUPPRESS_SHEET_QUERY).matches;
}

const serverSnapshot = () => false;

/** True below 1024px: the suppress action renders in a <Sheet> instead of a <Dialog>. */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
