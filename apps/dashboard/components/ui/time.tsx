"use client";

import { useEffect, useState } from "react";
import { absoluteTime, relativeTime } from "@/lib/format";

// Shared ticking clock so every relative timestamp on screen updates together.
const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(fn: (now: number) => void): () => void {
  listeners.add(fn);
  timer ??= setInterval(() => {
    const now = Date.now();
    listeners.forEach((l) => l(now));
  }, 30_000);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(setNow), []);
  return now;
}

export function RelativeTime({ ts, className }: { ts: number; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={new Date(ts).toISOString()} title={absoluteTime(ts)} className={className} suppressHydrationWarning>
      {relativeTime(ts, now)}
    </time>
  );
}
