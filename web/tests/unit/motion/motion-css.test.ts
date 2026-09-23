// OWNER: T3. Structural guarantees of src/styles/motion.css (motion spec Appendix C
// greps, design R8): nothing hidden by the static stylesheet, reveals only under
// html.anim-ready, the stamp never transitions, every helper has a reduced state for
// both triggers. Computed behaviour is proven in handshake.browser.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "../../../scripts/lint-motion.mjs";

const css = readFileSync(path.resolve(import.meta.dirname, "../../../src/styles/motion.css"), "utf8");
const { decls, keyframes } = parseCss(css);
const outsideKeyframes = decls.filter((d) => !d.keyframes);
type Decl = (typeof decls)[number];

describe("src/styles/motion.css", () => {
  it("hides no content in the static stylesheet: no opacity 0 and no visibility hidden outside keyframes (R8)", () => {
    expect(outsideKeyframes.filter((d) => d.prop === "opacity" && Number.parseFloat(d.value) === 0)).toEqual([]);
    expect(outsideKeyframes.filter((d) => d.prop === "visibility" && d.value === "hidden")).toEqual([]);
  });

  it("collapses only the scan line at rest (decoration that exists while it travels)", () => {
    const collapsed = outsideKeyframes.filter((d) => d.prop === "scale" && /\b0$/.test(d.value.trim()));
    expect(collapsed.map((d) => d.selector)).toEqual([".scan"]);
  });

  it("has no will-change, no animation-timeline and no literal durations or curves", () => {
    expect(decls.filter((d) => d.prop === "will-change" || d.prop.includes("timeline"))).toEqual([]);
    const literals = outsideKeyframes.filter((d) => /^(transition|animation)/.test(d.prop) && (/\b\d+m?s\b/.test(d.value.replace(/var\([^)]*\)/g, "")) || /cubic-bezier\(/.test(d.value)));
    expect(literals).toEqual([]);
  });

  it("runs reveal and first-appearance draws only under html.anim-ready, and never for data-anim-in=static", () => {
    const anim = outsideKeyframes.filter((d) => /\[data-anim\]/.test(d.selector) && /^animation/.test(d.prop));
    expect(anim.length).toBeGreaterThan(0);
    for (const d of anim) {
      expect(d.selector).toMatch(/html\.anim-ready/);
      expect(d.selector).toMatch(/\[data-anim-in=""\]/);
    }
  });

  it("puts the stamp's no-transition rule in @layer base with !important (beats every utility)", () => {
    const rule = decls.find((d) => d.selector === ".stamp" && d.prop === "transition");
    expect(rule).toMatchObject({ value: "none", important: true, atRules: [{ name: "layer", params: "base" }] });
    expect(decls.filter((d) => /\.stamp/.test(d.selector) && d.prop.startsWith("transition") && d !== rule)).toEqual([]);
  });

  it("animates the stamp only by scale, over --dur-2 on --ease-snap: declarative, rest, a, b", () => {
    for (const name of ["prg-stamp", "prg-stamp-a", "prg-stamp-b"]) {
      expect(keyframes.find((k) => k.name === name)?.props.map((p) => p.prop)).toEqual(["scale", "scale"]);
    }
    const inComponents = (d: Decl) => d.atRules.length === 1 && d.atRules[0].params === "components";
    const rule = (selector: string) => outsideKeyframes.find((d) => d.selector === selector && d.prop === "animation" && inComponents(d))?.value;
    expect(rule(".stamp")).toBe("prg-stamp var(--dur-2) var(--ease-snap)"); // plays when the class arrives
    expect(rule(".stamp[data-stamp]")).toBe("none"); // controlled: "rest" never plays
    expect(rule('.stamp[data-stamp="a"]')).toBe("prg-stamp-a var(--dur-2) var(--ease-snap)");
    expect(rule('.stamp[data-stamp="b"]')).toBe("prg-stamp-b var(--dur-2) var(--ease-snap)");
  });

  it("ticks the heartbeat at the telemetry period on steps(1, end), 0.35 → 1 at 12%", () => {
    expect(outsideKeyframes.find((d) => d.selector === ".heartbeat" && d.prop === "animation")?.value).toBe("prg-tick var(--heartbeat-period) steps(1, end) infinite");
    expect(css).toMatch(/@keyframes prg-tick \{\s*0%, 100% \{ opacity: 0\.35; \}\s*12% \{ opacity: 1; \}/);
  });

  it("stops a stale heartbeat and flips its colour in 0ms; a lagging one changes colour over --dur-1", () => {
    expect(outsideKeyframes.filter((d) => d.selector === ".heartbeat[data-stale]").map((d) => `${d.prop}:${d.value}`)).toEqual(["animation:none", "opacity:1"]);
    const stale = outsideKeyframes.filter((d) => d.selector === ":where(.heartbeat[data-stale]:not(svg *))");
    expect(stale.map((d) => `${d.prop}:${d.value}`)).toEqual(["background-color:var(--heartbeat-stale)", "transition:none"]);
    const dot = outsideKeyframes.find((d) => d.selector === ":where(.heartbeat:not(svg *))" && d.prop === "transition");
    expect(dot?.value).toBe("background-color var(--dur-1) var(--ease-snap)");
  });

  it.each([".heartbeat", ".stamp", ".stamp[data-stamp]", ".draw[data-draw]", ".scan[data-scan]", ".reveal", ".draw[data-anim]"])(
    "%s has a reduced state for the OS preference AND html[data-motion=reduced]",
    (helper) => {
      const matches = (d: Decl) => splitSelectors(d.selector).some((s) => s.endsWith(helper) || s.includes(`${helper}[`) || s.includes(`${helper}.`)) && /^animation/.test(d.prop);
      const os = decls.filter((d) => matches(d) && d.atRules.some((a) => a.name === "media" && /prefers-reduced-motion:\s*reduce/.test(a.params)));
      const toggle = decls.filter((d) => matches(d) && /\[data-motion="reduced"\]/.test(d.selector));
      expect(os.length, "prefers-reduced-motion").toBeGreaterThan(0);
      expect(toggle.length, "data-motion").toBeGreaterThan(0);
    },
  );

  it("never blanket-disables animation (`* { animation: none }` is forbidden, §5)", () => {
    expect(decls.filter((d) => /(^|[\s,>])\*(\s|,|$)/.test(d.selector) && /^animation/.test(d.prop))).toEqual([]);
  });
});

function splitSelectors(selector: string): string[] {
  return selector.split(",").map((s) => s.trim());
}
