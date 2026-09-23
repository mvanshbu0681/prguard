"use client";
// OWNER: T3 (wave 1). Reveal (motion spec §4.5): rows marked data-anim + .reveal, and
// nothing else. The document revealer that markAnimReady() starts reveals them when
// they cross 84% of the viewport, batched, staggered by --stagger-sibling and capped at
// the 6th item. "mount rows" proves content mounted later is revealed too; with the
// runtime blocked those rows force-reveal 1600ms after they mount instead.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/motion/reduced";
import { pendingReveals, replayReveal } from "@/motion/reveal";
import { DUR, STAGGER, staggerDelay } from "@/motion/tokens";
import { LabButton, Readouts } from "./lab-ui";

const FIRST = 8;
const MORE = 6;

function RevealRow({ n, rise }: { n: number; rise: boolean }) {
  return (
    <li data-anim className={`reveal ${rise ? "reveal-rise" : ""} flex items-baseline justify-between gap-4 border-b border-rule-hair px-4 py-2 last:border-b-0`}>
      <span className="type-data text-text-primary">row {String(n).padStart(2, "0")}</span>
      <span className="type-data text-text-dim">{rise ? "opacity + 8px rise" : "opacity only"}</span>
    </li>
  );
}

export function RevealDemo() {
  const reduced = useReducedMotion(); // reduced motion: the same reveal over --dur-1, opacity only
  const list = useRef<HTMLUListElement>(null);
  const [extra, setExtra] = useState(0);
  const [status, setStatus] = useState({ revealed: 0, total: FIRST, pending: 0 });

  useEffect(() => {
    const read = () => {
      const rows = [...(list.current?.querySelectorAll("[data-anim]") ?? [])];
      const revealed = rows.filter((el) => getComputedStyle(el).visibility === "visible").length;
      setStatus((s) => (s.revealed === revealed && s.total === rows.length && s.pending === pendingReveals() ? s : { revealed, total: rows.length, pending: pendingReveals() }));
    };
    const first = requestAnimationFrame(read);
    const timer = window.setInterval(read, 250);
    return () => {
      cancelAnimationFrame(first);
      window.clearInterval(timer);
    };
  }, []);

  const rows = Array.from({ length: FIRST + extra }, (_, i) => i + 1);
  return (
    <div className="space-y-4">
      <ul ref={list} className="overflow-hidden rounded-panel border border-rule-1 bg-ink-1">
        {rows.map((n) => (
          <RevealRow key={n} n={n} rise={n % 2 === 0} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <LabButton onClick={() => list.current && replayReveal(list.current.querySelectorAll("[data-anim]"))}>replay reveal</LabButton>
        <LabButton onClick={() => setExtra((n) => n + MORE)}>mount {MORE} rows</LabButton>
        <Readouts
          className="md:ml-auto"
          items={[
            { label: "visible", value: `${status.revealed} / ${status.total}` },
            { label: "waiting", value: String(status.pending) },
            { label: "stagger", value: `${STAGGER.sibling}ms · cap ${staggerDelay(STAGGER.cap)}ms` },
            { label: "duration", value: reduced ? `${DUR.hover}ms · reduced` : `${DUR.enter}ms` },
          ]}
        />
      </div>
    </div>
  );
}
