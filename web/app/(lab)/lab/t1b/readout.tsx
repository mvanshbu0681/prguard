"use client";

// OWNER: T1b (wave 1). Prints what the browser actually computed for a
// [data-measure="<key>"] element, so a screenshot of /lab/t1b is its own
// evidence: row heights in px, and transitions as token names.
import { useEffect, useState } from "react";

type Metric = "height" | "transition";

const EASE_TOKENS = ["--ease-snap", "--ease-instrument", "--ease-mass", "--ease-exit"] as const;
const DURATION_TOKENS = ["--dur-0", "--dur-1", "--dur-2", "--dur-3", "--dur-4", "--dur-5", "--dur-exit", "--dur-active"] as const;

/** A timing function as comparable text: "cubic-bezier(.2,0,0,1)" and "cubic-bezier(0.2, 0, 0, 1)" agree. */
export function easeKey(value: string): string {
  const bezier = /cubic-bezier\(([^)]*)\)/.exec(value);
  if (!bezier) return value.trim().toLowerCase();
  return bezier[1]
    .split(",")
    .map((n) => String(parseFloat(n)))
    .join(",");
}

/** Split a computed list ("a, cubic-bezier(1, 2, 3, 4), b") on top-level commas only. */
export function splitList(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** "0.12s" / "120ms" → 120 */
export function toMs(value: string): number {
  const v = value.trim();
  return v.endsWith("ms") ? parseFloat(v) : Math.round(parseFloat(v) * 1000);
}

function describeTransition(el: Element): string {
  const cs = getComputedStyle(el);
  const root = getComputedStyle(document.documentElement);
  const easeNames = new Map(EASE_TOKENS.map((t) => [easeKey(root.getPropertyValue(t)), t.slice(2)]));
  const durNames = new Map(DURATION_TOKENS.map((t) => [toMs(root.getPropertyValue(t)), t.slice(2)]));
  const durations = [...new Set(splitList(cs.transitionDuration).map(toMs))];
  const eases = [...new Set(splitList(cs.transitionTimingFunction).map((f) => easeNames.get(easeKey(f)) ?? f))];
  const dur = durations.map((ms) => `${ms}ms${durNames.has(ms) ? ` (${durNames.get(ms)})` : ""}`).join(" / ");
  return `${dur} · ${eases.join(" / ")}`;
}

export function Readout({ target, metric, className }: { target: string; metric: Metric; className?: string }) {
  const [text, setText] = useState("measuring");
  useEffect(() => {
    let live = true;
    let frame = 0;
    document.fonts.ready.then(() => {
      frame = requestAnimationFrame(() => {
        if (!live) return;
        const el = document.querySelector(`[data-measure="${target}"]`);
        if (!el) return setText(`no [data-measure="${target}"]`);
        setText(metric === "height" ? `${Math.round(el.getBoundingClientRect().height * 10) / 10}px` : describeTransition(el));
      });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [target, metric]);
  return (
    <span data-slot="lab-readout" className={className ?? "type-data text-text-body"}>
      {text}
    </span>
  );
}
