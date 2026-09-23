"use client";
// OWNER: T3 (wave 1). The heartbeat dot: the only loop in the product, driven by the
// wire (motion spec §4.9.2, §4.9.3). Three fixed ages show the three states; the live
// row runs a real 1 Hz ticker that updates only its text, with controls to make output
// arrive or to skip ahead.
import { useEffect, useState } from "react";
import { heartbeatLabel, heartbeatProps } from "@/motion/heartbeat";
import { HEARTBEAT } from "@/motion/tokens";
import { LabButton } from "./lab-ui";

const FIXED = [4_000, 12_000, 21_000] as const;
const SKIP_MS = 10_000;

function Row({ ageMs, label }: { ageMs: number | null; label: string }) {
  const props = heartbeatProps(ageMs, HEARTBEAT.period);
  const caution = props["data-heartbeat"] !== "live";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="heartbeat shrink-0" aria-hidden {...props} />
      <span className={`type-data ${caution ? "text-marker-text" : "text-text-dim"}`}>{heartbeatLabel(ageMs)}</span>
      <span className="ml-auto type-label text-text-dim">{label}</span>
    </div>
  );
}

export function HeartbeatDemo() {
  // One clock reading for both, so the server and the client both render age 0.
  const [clock, setClock] = useState(() => {
    const t = performance.now();
    return { lastOutputAt: t, now: t };
  });
  useEffect(() => {
    const ticker = window.setInterval(() => setClock((c) => ({ ...c, now: performance.now() })), 1000); // text only
    return () => window.clearInterval(ticker);
  }, []);
  const age = Math.max(0, clock.now - clock.lastOutputAt);
  const state = heartbeatProps(age)["data-heartbeat"];

  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-rule-1 bg-rule-1 md:grid-cols-2">
      <div className="space-y-3 bg-ink-1 p-5">
        <p className="type-label text-text-dim">fixed ages</p>
        {FIXED.map((ageMs) => (
          <Row key={ageMs} ageMs={ageMs} label={heartbeatProps(ageMs)["data-heartbeat"]} />
        ))}
      </div>
      <div className="space-y-3 bg-ink-1 p-5">
        <p className="type-label text-text-dim">live · 1 Hz text ticker</p>
        <Row ageMs={age} label={state} />
        <div className="flex flex-wrap gap-2 pt-1">
          <LabButton
            onClick={() => {
              const t = performance.now();
              setClock({ lastOutputAt: t, now: t });
            }}
          >
            output arrives
          </LabButton>
          <LabButton onClick={() => setClock((c) => ({ ...c, lastOutputAt: c.lastOutputAt - SKIP_MS }))}>skip {SKIP_MS / 1000}s</LabButton>
        </div>
      </div>
    </div>
  );
}
