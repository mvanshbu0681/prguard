// OWNER: T3. The heartbeat dot's attributes from telemetry (motion spec §4.9.2, §4.9.3).
import { describe, expect, it } from "vitest";
import { heartbeatLabel, heartbeatProps } from "@/motion/heartbeat";
import { HEARTBEAT } from "@/motion/tokens";

describe("heartbeatProps", () => {
  it("live under 10s: ticking at the telemetry period, written on the dot", () => {
    expect(heartbeatProps(4_000, 1200)).toEqual({ "data-heartbeat": "live", style: { "--heartbeat-period": "1200ms" } });
  });

  it("lagging from 10s: --marker, still ticking", () => {
    expect(heartbeatProps(12_000)).toEqual({ "data-heartbeat": "lagging", "data-lagging": "", style: { "--heartbeat-period": `${HEARTBEAT.period}ms` } });
  });

  it("stale from 20s: --marker, stopped; no telemetry at all counts as stale", () => {
    expect(heartbeatProps(21_000)).toMatchObject({ "data-heartbeat": "stale", "data-stale": "" });
    expect(heartbeatProps(null)).toMatchObject({ "data-heartbeat": "stale", "data-stale": "" });
    expect(heartbeatProps(undefined)).toMatchObject({ "data-heartbeat": "stale" });
  });

  it("falls back to the default period for a nonsense interval", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(heartbeatProps(0, bad).style).toEqual({ "--heartbeat-period": "1200ms" });
    expect(heartbeatProps(0, 1500.4).style).toEqual({ "--heartbeat-period": "1500ms" });
  });
});

describe("heartbeatLabel", () => {
  it("prints whole seconds since the last output", () => {
    expect(heartbeatLabel(0)).toBe("0s since last output");
    expect(heartbeatLabel(12_900)).toBe("12s since last output");
    expect(heartbeatLabel(21_000)).toBe("21s since last output");
    expect(heartbeatLabel(null)).toBe("no output yet");
    expect(heartbeatLabel(-1)).toBe("no output yet");
  });
});
