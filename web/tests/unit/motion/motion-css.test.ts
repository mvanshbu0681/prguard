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

describe("src/styles/motion.css", () => {
  it("hides nothing in the static stylesheet: no opacity 0 and no visibility hidden outside keyframes (R8)", () => {
    expect(outsideKeyframes.filter((d) => d.prop === "opacity" && Number.parseFloat(d.value) === 0)).toEqual([]);
    expect(outsideKeyframes.filter((d) => d.prop === "visibility" && d.value === "hidden")).toEqual([]);
  });

  it("has no will-change, no animation-timeline and no literal durations or curves", () => {
    expect(decls.filter((d) => d.prop === "will-change" || d.prop.includes("timeline"))).toEqual([]);
    const literals = outsideKeyframes.filter((d) => /^(transition|animation)/.test(d.prop) && (/\b\d+m?s\b/.test(d.value.replace(/var\([^)]*\)/g, "")) || /cubic-bezier\(/.test(d.value)));
    expect(literals).toEqual([]);
  });

  it("runs reveal and first-appearance draws only under html.anim-ready", () => {
    const anim = outsideKeyframes.filter((d) => /\[data-anim\]/.test(d.selector) && /^animation/.test(d.prop));
    expect(anim.length).toBeGreaterThan(0);
    for (const d of anim) expect(d.selector).toMatch(/html\.anim-ready/);
  });

  it("puts the stamp's no-transition rule in @layer base with !important (beats every utility)", () => {
    const rule = decls.find((d) => d.selector === ".stamp" && d.prop === "transition");
    expect(rule).toMatchObject({ value: "none", important: true, atRules: [{ name: "layer", params: "base" }] });
    expect(decls.filter((d) => /\.stamp/.test(d.selector) && d.prop.startsWith("transition") && d !== rule)).toEqual([]);
  });

  it("animates the stamp only by scale, over --dur-2 on --ease-snap", () => {
    for (const name of ["prg-stamp-a", "prg-stamp-b"]) {
      expect(keyframes.find((k) => k.name === name)?.props.map((p) => p.prop)).toEqual(["scale", "scale"]);
    }
    const stamp = outsideKeyframes.filter((d) => /\.stamp\[data-stamp="[ab]"\]/.test(d.selector) && d.prop === "animation");
    expect(stamp.map((d) => d.value)).toEqual(["prg-stamp-a var(--dur-2) var(--ease-snap)", "prg-stamp-b var(--dur-2) var(--ease-snap)"]);
  });

  it("ticks the heartbeat at the telemetry period on steps(1, end), 0.35 → 1 at 12%", () => {
    expect(outsideKeyframes.find((d) => d.selector === ".heartbeat" && d.prop === "animation")?.value).toBe("prg-tick var(--heartbeat-period) steps(1, end) infinite");
    expect(css).toMatch(/@keyframes prg-tick \{\s*0%, 100% \{ opacity: 0\.35; \}\s*12% \{ opacity: 1; \}/);
  });

  it.each([".heartbeat", ".stamp[data-stamp]", ".draw[data-draw]", ".scan[data-scan]", ".reveal", ".draw[data-anim]"])("%s has a reduced state for the OS preference AND html[data-motion=reduced]", (helper) => {
    const matches = (d: (typeof decls)[number]) => d.selector.includes(helper) && /^animation/.test(d.prop);
    const os = decls.filter((d) => matches(d) && d.atRules.some((a) => a.name === "media" && /prefers-reduced-motion:\s*reduce/.test(a.params)));
    const toggle = decls.filter((d) => matches(d) && /\[data-motion="reduced"\]/.test(d.selector));
    expect(os.length, "prefers-reduced-motion").toBeGreaterThan(0);
    expect(toggle.length, "data-motion").toBeGreaterThan(0);
  });

  it("never blanket-disables animation (`* { animation: none }` is forbidden, §5)", () => {
    expect(decls.filter((d) => /(^|[\s,>])\*(\s|,|$)/.test(d.selector) && /^animation/.test(d.prop))).toEqual([]);
  });
});
