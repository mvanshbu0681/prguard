// OWNER: T3 (wave 1). The heartbeat dot, driven by the wire (motion spec §4.9.2,
// §4.9.3). The only loop in the product, and it must never pulse when nothing is
// happening:
//
//   <span className="heartbeat" aria-hidden {...heartbeatProps(ageMs, periodMs)} />
//   <span>{heartbeatLabel(ageMs)}</span>          ← a 1 Hz ticker updates only this text
//
//   age < 10s     --signal, ticking at the telemetry period
//   10s – 20s     --marker, still ticking (the colour change takes --dur-1)
//   age ≥ 20s     --marker, the tick stops (the colour flips in 0ms)
//
// The period is written on the dot's own style, never on :root (motion spec §6.1).
// Reduced motion: the dot is static at full opacity; the age text keeps ticking.
//
// Engine-free.

import type { CSSProperties } from "react";
import { HEARTBEAT, heartbeatState, type HeartbeatState } from "./tokens";

export interface HeartbeatProps {
  "data-heartbeat": HeartbeatState;
  "data-lagging"?: "";
  "data-stale"?: "";
  style: CSSProperties;
}

/**
 * The dot's attributes for a heartbeat `ageMs` old (null: no telemetry yet, which
 * counts as stale, because a dot that ticks without a signal is a lie). `periodMs` is
 * the real poll interval; anything not a positive number falls back to HEARTBEAT.period.
 */
export function heartbeatProps(ageMs: number | null | undefined, periodMs: number = HEARTBEAT.period): HeartbeatProps {
  const state = heartbeatState(ageMs ?? Number.NaN);
  const period = Number.isFinite(periodMs) && periodMs > 0 ? periodMs : HEARTBEAT.period;
  return {
    "data-heartbeat": state,
    ...(state === "lagging" ? { "data-lagging": "" as const } : {}),
    ...(state === "stale" ? { "data-stale": "" as const } : {}),
    style: { "--heartbeat-period": `${Math.round(period)}ms` } as CSSProperties,
  };
}

/** The age as printed beside the dot: `12s since last output`. */
export function heartbeatLabel(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "no output yet";
  return `${Math.floor(ageMs / 1000)}s since last output`;
}
