"use client";
// OWNER: T3 (wave 1). Three [data-anim] probes, server-rendered hidden by the handshake,
// and a measurement of how each one became visible: revealed by the runtime, kept
// static because its force-reveal had already fired, or force-revealed at 1600ms with no
// runtime at all. Timings are read from this browser (Web Animations API +
// performance.now), not typed.
import { useEffect, useRef, useState } from "react";
import { ANIM_IN_ATTR, FORCE_REVEAL_KEYFRAME } from "@/motion/handshake";
import { ms } from "./lab-ui";

interface Probe {
  /** When this element's force-reveal timer started (document timeline, ms). */
  armedAt: number | null;
  visibleAt: number | null;
  how: string;
}

const PROBES = ["captured output", "the provenance line", "the stat strip"] as const;
const WATCH_MS = 6000;

function describe(el: Element, visible: boolean): string {
  const state = el.getAttribute(ANIM_IN_ATTR);
  if (state === "static") return "kept static: its force-reveal fired first";
  if (state === "") return "revealed by the runtime";
  return visible ? "force-revealed: no runtime yet" : "hidden";
}

export function HandshakeProbes() {
  const list = useRef<HTMLUListElement>(null);
  const [probes, setProbes] = useState<Probe[]>(() => PROBES.map(() => ({ armedAt: null, visibleAt: null, how: "hidden" })));

  useEffect(() => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>("[data-anim]") ?? [])];
    const armed = els.map((el) => {
      const timer = el.getAnimations?.().find((a) => (a as CSSAnimation).animationName === FORCE_REVEAL_KEYFRAME);
      return typeof timer?.startTime === "number" ? timer.startTime : null;
    });
    const seen: (number | null)[] = els.map(() => null);
    const how: string[] = els.map(() => "hidden");
    const start = performance.now();
    let frame = 0;
    // Watch for WATCH_MS: long enough for the late runtime (2.5s) to re-label a probe.
    const poll = () => {
      let changed = false;
      els.forEach((el, i) => {
        if (seen[i] === null && getComputedStyle(el).visibility === "visible") {
          seen[i] = performance.now();
          changed = true;
        }
        const next = describe(el, seen[i] !== null);
        if (next !== how[i]) {
          how[i] = next;
          changed = true;
        }
      });
      if (changed) setProbes(els.map((_, i) => ({ armedAt: armed[i], visibleAt: seen[i], how: how[i] })));
      if (performance.now() - start < WATCH_MS) frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ul ref={list} className="grid gap-px overflow-hidden rounded-panel border border-rule-1 bg-rule-1 md:grid-cols-3">
      {PROBES.map((label, i) => {
        const p = probes[i];
        const delta = p.visibleAt !== null && p.armedAt !== null ? p.visibleAt - p.armedAt : null;
        return (
          <li key={label} data-anim className="reveal bg-ink-1 px-4 py-3">
            <p className="type-label text-text-dim">probe {i + 1}</p>
            <p className="mt-1 type-small text-text-primary">{label}</p>
            <dl className="mt-2 space-y-0.5 type-data">
              <div className="flex gap-2">
                <dt className="text-text-dim">armed</dt>
                <dd className="text-text-body">{ms(p.armedAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-dim">visible</dt>
                <dd className="text-text-body">
                  {ms(p.visibleAt)}
                  {delta !== null ? <span className="text-text-dim"> · +{ms(delta)}</span> : null}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-dim">how</dt>
                <dd className="text-text-body">{p.how}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
