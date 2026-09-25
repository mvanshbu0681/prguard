// OWNER: T3. The TS motion constants equal the CSS custom properties in
// app/tokens/core.css, parsed by the same reader `npm run tokens:verify` uses, so a
// GSAP timeline, a Motion transition and a CSS transition can never drift apart.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bezierYRange } from "@/motion/bezier";
import {
  CEILING,
  DUR,
  DUR_APP,
  DUR_S,
  DUR_VAR,
  EASE,
  HANDSHAKE,
  HEARTBEAT,
  LAYOUT_SPRING,
  ROW_GROUP_DELAYS,
  STAGGER,
  dampingRatio,
  heartbeatState,
  sec,
  staggerDelay,
} from "@/motion/tokens";
import { layered, loadTokens, resolveToken, type Context } from "../../../scripts/lib/tokens";

const WEB = path.resolve(import.meta.dirname, "../../..");
const model = loadTokens(WEB);

function ms(name: string, ctx: Context = "root"): number {
  const value = resolveToken(model, name, ctx).trim();
  const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(value);
  if (!m) throw new Error(`${name} is not a time: ${value}`);
  return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
}

function bezier(value: string): number[] {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(value.trim());
  if (!m) throw new Error(`not a cubic-bezier: ${value}`);
  return m[1].split(",").map((n) => Number(n.trim()));
}

function themeValue(name: string): string {
  const d = model.layers.theme.get(name);
  if (!d) throw new Error(`${name} is not registered in an @theme block`);
  return d.value;
}

describe("motion tokens match app/tokens/core.css", () => {
  it.each(Object.entries(EASE))("--ease-%s has the same control points", (name, token) => {
    expect(token.cssVar).toBe(`--ease-${name}`);
    expect(bezier(themeValue(token.cssVar))).toEqual([...token.points]);
    expect(bezier(token.css)).toEqual([...token.points]);
  });

  it("--ease-mass is cubic-bezier(0.52, 0, 0.08, 1) (brand-gaps §2 ruling 1)", () => {
    expect([...EASE.mass.points]).toEqual([0.52, 0, 0.08, 1]);
  });

  it("no easing token overshoots", () => {
    for (const token of Object.values(EASE)) {
      const { min, max } = bezierYRange(token.points);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
    }
  });

  it.each(Object.entries(DUR_VAR))("DUR.%s equals %s", (name, cssVar) => {
    expect(ms(cssVar)).toBe(DUR[name as keyof typeof DUR]);
  });

  it("the tiers are 0 / 120 / 180 / 240 / 420 / 1400, exit 160, active 90", () => {
    expect([DUR.instant, DUR.hover, DUR.state, DUR.reveal, DUR.enter, DUR.scan, DUR.exit, DUR.active]).toEqual([0, 120, 180, 240, 420, 1400, 160, 90]);
  });

  it("the design-system aliases resolve to the same tiers", () => {
    expect(ms("--dur-hover")).toBe(DUR.hover);
    expect(ms("--dur-state")).toBe(DUR.state);
    expect(ms("--dur-reveal")).toBe(DUR.reveal);
    expect(ms("--dur-enter")).toBe(DUR.enter);
    expect(ms("--dur-scan")).toBe(DUR.scan);
  });

  it("the dashboard surface overrides match DUR_APP and stay under the 220ms ceiling", () => {
    expect(ms("--dur-state", "app")).toBe(DUR_APP.state);
    expect(ms("--dur-enter", "app")).toBe(DUR_APP.enter);
    expect(Math.max(DUR_APP.state, DUR_APP.enter)).toBeLessThanOrEqual(CEILING.dashboard);
  });

  it("staggers, row groups and the heartbeat period match", () => {
    expect(ms("--stagger-sibling")).toBe(STAGGER.sibling);
    expect(ms("--stagger-stage")).toBe(STAGGER.stage);
    expect(ms("--stagger-row-group")).toBe(STAGGER.rowGroup);
    expect([...ROW_GROUP_DELAYS]).toEqual([0, 120, 240]);
    expect(ms("--heartbeat-period")).toBe(HEARTBEAT.period);
  });

  it("Tailwind's default transition is --dur-1 on --ease-snap", () => {
    const duration = themeValue("--default-transition-duration");
    expect(Number.parseFloat(duration)).toBe(DUR.hover);
    expect(bezier(themeValue("--default-transition-timing-function"))).toEqual([...EASE.snap.points]);
  });

  it("the handshake's force-reveal is 1600ms", () => {
    expect(HANDSHAKE.forceRevealMs).toBe(1600);
  });
});

describe("token helpers", () => {
  it("DUR_S is DUR in seconds", () => {
    for (const [name, value] of Object.entries(DUR)) expect(DUR_S[name as keyof typeof DUR_S]).toBe(sec(value));
  });

  it("staggerDelay caps at the 6th sibling", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 40].map((i) => staggerDelay(i))).toEqual([0, 60, 120, 180, 240, 300, 300, 300, 300]);
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
    expect(staggerDelay(2, STAGGER.stage)).toBe(240);
  });

  it("heartbeatState: live < 10s ≤ lagging < 20s ≤ stale", () => {
    expect(heartbeatState(0)).toBe("live");
    expect(heartbeatState(9_999)).toBe("live");
    expect(heartbeatState(10_000)).toBe("lagging");
    expect(heartbeatState(19_999)).toBe("lagging");
    expect(heartbeatState(20_000)).toBe("stale");
    expect(heartbeatState(Number.NaN)).toBe("stale");
  });

  it("the one permitted spring is critically damped (ζ = 1.009)", () => {
    expect(dampingRatio(LAYOUT_SPRING)).toBeCloseTo(1.009, 3);
    expect(dampingRatio(LAYOUT_SPRING)).toBeGreaterThanOrEqual(1);
  });
});

describe("src/styles/motion.css references only tokens that exist", () => {
  // Hooks motion.css documents for callers to set; everything else must be a token.
  const HOOKS = new Set(["--motion-dur", "--motion-delay", "--reveal-index", "--reveal-rise", "--scan-travel", "--draw-len"]);
  const css = readFileSync(path.join(WEB, "src/styles/motion.css"), "utf8");
  const used = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];

  const defined = layered(model, "root");

  it.each(used.filter((n) => !HOOKS.has(n)))("%s is defined in app/tokens", (name) => {
    expect(defined.has(name) || model.layers.theme.has(name)).toBe(true);
  });
});
