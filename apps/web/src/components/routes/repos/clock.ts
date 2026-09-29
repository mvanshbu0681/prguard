'use client';
// A shared wall clock for the simulated reviews, as an external store: every
// consumer at the same interval reads one timer, and render stays pure (no
// Date.now() in a component body). 0 until the first client read.
import { useSyncExternalStore } from 'react';

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const clocks = new Map<number, Clock>();

function clock(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) {
    c = { now: 0, listeners: new Set(), timer: null };
    clocks.set(ms, c);
  }
  return c;
}

function subscribeTo(ms: number) {
  return (l: () => void) => {
    const c = clock(ms);
    c.listeners.add(l);
    if (!c.timer) {
      c.now = Date.now();
      c.timer = setInterval(() => {
        c.now = Date.now();
        c.listeners.forEach((fn) => fn());
      }, ms);
    }
    return () => {
      c.listeners.delete(l);
      if (c.listeners.size === 0 && c.timer) {
        clearInterval(c.timer);
        c.timer = null;
      }
    };
  };
}

const subscribers = new Map<number, (l: () => void) => () => void>();

/** Epoch ms, refreshed every `ms` while mounted; 0 during server render. Pass `paused` to stop ticking. */
export function useNow(ms = 1000, paused = false): number {
  const key = paused ? 0 : ms;
  let sub = subscribers.get(key);
  if (!sub) {
    sub = key === 0 ? () => () => {} : subscribeTo(key);
    subscribers.set(key, sub);
  }
  return useSyncExternalStore(
    sub,
    () => {
      const c = clock(key);
      if (c.now === 0) c.now = Date.now();
      return c.now;
    },
    () => 0,
  );
}
