"use client";
// OWNER: d1 (wave 3). The run header's ticking "elapsed" readout while a run is live
// (dashboard §2.4 header: "risk tier · trigger · elapsed"). A 1Hz ticker, same shape as
// @/motion/heartbeat's own age clock: it writes a NUMBER the caller formats, never a class
// or a style, and it stops ticking the moment `enabled` goes false (the run went terminal —
// the header then switches to the recorded `timing.duration_seconds`, which does not tick).
import { useEffect, useState } from "react";

/** The wall clock, re-read once a second while `enabled`; it holds its last value once disabled. */
export function useNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

/** Seconds from `startedAt` (ISO 8601) to `now`, or null without a parsable start. */
export function elapsedSince(startedAt: string | null | undefined, now: number): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, (now - started) / 1000);
}

/**
 * Seconds since `startedAt` (ISO 8601), re-read once a second while `enabled`. Returns null
 * before a start time exists (queued, nothing to count from yet) or once disabled.
 */
export function useElapsedSeconds(startedAt: string | null | undefined, enabled: boolean): number | null {
  const now = useNow(enabled && !!startedAt);
  if (!enabled || !startedAt) return null;
  return elapsedSince(startedAt, now);
}
