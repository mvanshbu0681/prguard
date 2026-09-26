// OWNER: T3. `npm run motion:lint` catches every seeded violation, at the right
// file:line, flags nothing legitimate, and passes the real tree.
//
// The fixture tree is written to a temp directory from the strings below, so it is
// never type-checked or ESLinted. A line that must be reported carries
// `@expect <rule> [<rule>…]`; every other line must stay silent.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bezierProblems, fingerprint, lintMotion, parseCss, RULES, targetsRoot, transitionProperties } from "../../../scripts/lint-motion.mjs";

const WEB = path.resolve(import.meta.dirname, "../../..");

const FIXTURES: Record<string, string> = {
  "src/styles/bad.css": `
.a { transition: width 200ms ease; }                            /* @expect compositor */
.b { transition: all var(--dur-1) var(--ease-snap); }            /* @expect compositor */
.c { transition: 120ms; }                                        /* @expect compositor */
.d { transition-property: opacity, box-shadow; }                 /* @expect compositor */
@keyframes grow { to { height: 40px; } }                         /* @expect compositor */
@keyframes hue { to { --angle: 90deg; } }                        /* @expect compositor */
.e { animation: accordion-down 200ms; }                          /* @expect compositor */
.stamp { transition: background-color 120ms; }                   /* @expect stamp-colour */
[data-verdict] { transition-duration: 60ms; }                    /* @expect stamp-colour */
.f { transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); } /* @expect overshoot */
.g { animation: grow 1s cubic-bezier(0.36, 0, 0.66, -0.56); }    /* @expect overshoot */
.h { animation-timeline: view(); }                               /* @expect timeline */
@supports not (animation-timeline: scroll()) { .i { animation-timeline: scroll(); } } /* @expect timeline */
.j { will-change: transform; }                                   /* @expect will-change */
:root { transition: --grid-alpha 420ms; }                        /* @expect compositor root-custom-property */
html.x { animation: hue 1s infinite; }                           /* @expect root-custom-property */
.k {
  &.stamp { transition: color 120ms; }                           /* @expect stamp-colour */
}
.list { height: 40px; transition: height var(--dur-2) var(--ease-snap); } /* @expect compositor */
@keyframes dash { from { stroke-dasharray: 0 1; } to { stroke-dasharray: 1 0; } } /* @expect compositor */
@keyframes half { from { stroke-dasharray: 1 1; stroke-dashoffset: 1; } 50% { stroke-dasharray: 1 1; } } /* @expect compositor */
.m { transition: background-color var(--dur-4) var(--ease-snap); }  /* @expect compositor */
.n { transition: opacity 420ms, color 0.3s; }                    /* @expect compositor */
.o { transition-property: stroke-dashoffset; transition-duration: var(--dur-5); } /* @expect compositor */
`,
  "src/styles/good.css": `
.a { transition: opacity var(--dur-3) var(--ease-instrument), transform var(--dur-3) var(--ease-instrument); }
.b { transition: background-color var(--dur-1) var(--ease-snap), border-color var(--dur-1) var(--ease-snap); }
.c { transition: stroke-dashoffset var(--dur-2) linear, filter var(--dur-3) var(--ease-instrument); }
.d { transition: none; }
.stamp { transition: none !important; }
.stamp[data-stamp="a"] { animation: prg-stamp-a var(--dur-2) var(--ease-snap); }
[cmdk-list] { height: var(--cmdk-list-height); transition: height var(--dur-2) var(--ease-snap); }
.ui-command__list { height: var(--cmdk-list-height); max-height: 296px; transition: height var(--ui-list-dur) var(--ease-snap); }
@keyframes prg-stamp-a { from { scale: 1.045; } to { scale: 1; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes force-reveal { to { visibility: visible; } }
@keyframes rise { from { translate: 0 8px; clip-path: inset(0 100% 0 0); } }
@keyframes draw { from { stroke-dasharray: var(--draw-len, 1) var(--draw-len, 1); stroke-dashoffset: var(--draw-len, 1); } to { stroke-dasharray: var(--draw-len, 1)  var(--draw-len, 1); stroke-dashoffset: 0; } }
@keyframes packet { 0%, 100% { stroke-dasharray: 0.06 0.94; } 50% { stroke-dashoffset: 0.5; } }
@keyframes tick { 0% { opacity: .35; animation-timing-function: steps(1, end); } 12% { opacity: 1; } }
.e { transition-timing-function: cubic-bezier(0.33, 0, 0.12, 1); }
.f { transition-timing-function: cubic-bezier(0.52, 0, 0.08, 1); }
@supports (animation-timeline: scroll()) { .progress { animation-timeline: scroll(); } }
.g { will-change: auto; }
:root { --grid-alpha: 0.028; --ease-snap: cubic-bezier(0.2, 0, 0, 1); }
html.anim-ready [data-anim] { animation: none; }
html { background: var(--ink-0); }
.h { transition: var(--my-transition); }
.i { transition: color var(--dur-1) var(--ease-snap), outline-color var(--dur-1) var(--ease-snap), fill var(--dur-1) var(--ease-snap); }
.j { transition: opacity var(--dur-4) var(--ease-instrument), border-color var(--dur-3) var(--ease-snap) 600ms; }
@utility tick { animation: tick var(--heartbeat-period) steps(1, end) infinite; }
@custom-variant motion-reduce {
  @media (prefers-reduced-motion: reduce) { @slot; }
  &:where([data-motion="reduced"] *) { @slot; }
}
`,
  "src/motion/bad-motion.ts": `
import { gsap } from "gsap";
export function jitter(el: HTMLElement) {
  gsap.to(el, { x: Math.random() * 10 });                          // @expect math-random
  gsap.to(el, { width: 100, duration: 0.42 });                     // @expect compositor
  gsap.fromTo(el, { height: 0 }, { height: 40 });                  // @expect compositor
  gsap.to(el, { marginTop: 8, keyframes: { boxShadow: ["0 0 0 red", "none"] } }); // @expect compositor
  gsap.to(el, { x: 10, ease: "back.out(1.7)" });                   // @expect overshoot
  gsap.to(el, { x: 10, ease: "elastic" });                         // @expect overshoot
  gsap.to(el, { x: "random(-10, 10)" });                           // @expect math-random
  gsap.to(document.documentElement, { "--x": 1 });                 // @expect root-custom-property
  document.documentElement.style.setProperty("--heartbeat-period", "1200ms"); // @expect root-custom-property
  el.style.transition = "width 200ms";                             // @expect compositor
  const spring = { type: "spring", stiffness: 300, damping: 10 };  // @expect overshoot
  const bouncy = { type: "spring", duration: 0.4 };                // @expect overshoot
  const back = { ease: [0.34, 1.56, 0.64, 1] };                    // @expect overshoot
  return [gsap.utils.random(0, 1), spring, bouncy, back];          // @expect math-random
}
`,
  "src/motion/good-motion.ts": `
import { gsap } from "gsap";
export function ok(el: HTMLElement) {
  el.style.willChange = "transform";
  gsap.to(el, { x: 10, y: 4, opacity: 1, scaleY: 1, autoAlpha: 1, clipPath: "inset(0 0 0 0)", strokeDashoffset: 0, backgroundColor: "#000", duration: 0.42, ease: "instrument", transformOrigin: "top", onComplete: () => { el.style.willChange = "auto"; } });
  gsap.to({ p: 0 }, { p: 1, duration: 1.4, ease: "none" });
  gsap.fromTo(el, { attr: { "data-state": "a" } }, { attr: { "data-state": "b" }, duration: 0 });
  el.style.setProperty("--heartbeat-period", "1200ms");
  const spring = { type: "spring", stiffness: 520, damping: 46, mass: 1 };
  const critical = { type: "spring", bounce: 0, duration: 0.18 };
  const snap = { ease: [0.2, 0, 0, 1] };
  return [spring, critical, snap, "cubic-bezier(0.33, 0, 0.12, 1)"];
}
`,
  "src/lib/ids.ts": `
// Not motion code: randomness is fine here.
export const id = () => Math.random().toString(36).slice(2);
`,
  "src/components/charts/chart.tsx": `
import { gsap } from "@/motion/gsap";                              // @expect engine-boundary
export const Chart = () => <svg data-g={String(Boolean(gsap))} />;
`,
  "app/(app)/dash/page.tsx": `
import { useReplay } from "@/motion/useReplay";                    // @expect engine-boundary
import { m, useSequence } from "@/motion/motion";
export default function Page() {
  void useReplay; void useSequence;
  return (
    <ul>
      <m.li animate={{ height: "auto" }} transition={{ type: "spring", stiffness: 100, damping: 10 }} /> {/* @expect compositor overshoot */}
      <m.li initial={{ opacity: 0 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 520, damping: 46 }} />
      <m.li variants={{ open: { width: 200 }, closed: { opacity: 0.45 } }} /> {/* @expect compositor */}
    </ul>
  );
}
`,
  "app/(marketing)/section.tsx": `
import { MotionProvider } from "@/motion/motion";                  // @expect engine-boundary
import { useReplay } from "@/motion/useReplay";
export function Section() {
  void MotionProvider; void useReplay;
  return (
    <div>
      <span className="stamp transition-colors" />                     {/* @expect stamp-colour */}
      <div className="transition-all" />                               {/* @expect compositor */}
      <div className="md:hover:transition-[width,opacity]" />          {/* @expect compositor */}
      <div className="transition-shadow" />                            {/* @expect compositor */}
      <div className="will-change-transform" />                        {/* @expect will-change */}
      <div className="[animation-timeline:view()]" />                  {/* @expect timeline */}
      <div className="ease-[cubic-bezier(0.34,1.56,0.64,1)]" />        {/* @expect overshoot */}
      <div className="animate-accordion-down" />                       {/* @expect compositor */}
      <a className="transition-colors duration-500 hover:text-signal" /> {/* @expect compositor */}
      <div style={{ transition: "height 200ms", willChange: "opacity" }} /> {/* @expect compositor will-change */}
      <div data-verdict="proven" className="transition" />             {/* @expect compositor stamp-colour */}
      <style>{\`@keyframes wobble { to { top: 4px; } }\`}</style>      {/* @expect compositor */}
    </div>
  );
}
const button = cva("inline-flex transition-all");                    // @expect compositor
`,
  "app/(marketing)/good.tsx": `
import { useReplay } from "@/motion/useReplay";
import { GsapRuntime } from "@/motion/GsapRuntime";
export function Good() {
  void useReplay; void GsapRuntime;
  return (
    <div>
      <span className="stamp transition-none" data-stamp="a" />
      <button className="transition-colors duration-(--dur-1) ease-snap hover:bg-ink-3 motion-safe:transition-transform" />
      <div className="transition-opacity duration-(--dur-4)" />
      <div className="transition-opacity [transition:opacity_120ms]" />
      <div className="supports-[animation-timeline:scroll()]:[animation-timeline:scroll()]" />
      <div className="animate-none animate-[prg-reveal_420ms_both] will-change-auto" />
      <p>The transition from pending to done is instant.</p>
      <div style={{ transition: "opacity 240ms, transform 240ms" }} />
      <style dangerouslySetInnerHTML={{ __html: "@keyframes force-reveal{to{visibility:visible}}[data-anim]{animation:force-reveal 0s 1600ms forwards}" }} />
    </div>
  );
}
const label = "transition";
const ok = cn("transition-colors", label);
`,
};

function expectations(): Set<string> {
  const out = new Set<string>();
  for (const [file, text] of Object.entries(FIXTURES)) {
    text.split("\n").forEach((line, i) => {
      const m = /@expect\s+([a-z-]+(?:\s+[a-z-]+)*)/.exec(line);
      if (m) for (const rule of m[1].split(/\s+/)) out.add(`${file}:${i + 1}:${rule}`);
    });
  }
  return out;
}

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "prguard-motion-lint-"));
  for (const [file, text] of Object.entries(FIXTURES)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("lint-motion on the seeded fixture", () => {
  it("reports exactly the seeded violations, at file:line, and nothing legitimate", () => {
    const { violations } = lintMotion({ root, baseline: [] });
    const found = new Set(violations.map((v) => `${v.file}:${v.line}:${v.rule}`));
    const expected = expectations();
    const missing = [...expected].filter((k) => !found.has(k));
    const unexpected = violations.filter((v) => !expected.has(`${v.file}:${v.line}:${v.rule}`)).map((v) => `${v.file}:${v.line}:${v.rule}  ${v.message}`);
    expect(missing, "violations the lint missed").toEqual([]);
    expect(unexpected, "false positives").toEqual([]);
  });

  it("covers every rule", () => {
    const rules = new Set([...expectations()].map((k) => k.split(":").at(-1)));
    expect([...rules].sort()).toEqual(Object.keys(RULES).sort());
  });

  it("the good files are silent", () => {
    const { violations } = lintMotion({ root, baseline: [] });
    expect(violations.filter((v) => /good|ids\.ts/.test(v.file))).toEqual([]);
  });

  it("exits 1 and prints file:line:col for each violation", () => {
    let status = 0;
    let out = "";
    try {
      execFileSync(process.execPath, [path.join(WEB, "scripts/lint-motion.mjs"), "--root", root], { encoding: "utf8" });
    } catch (e) {
      const err = e as { status: number; stdout: string };
      status = err.status;
      out = err.stdout;
    }
    expect(status).toBe(1);
    expect(out).toMatch(/^src\/styles\/bad\.css:2:\d+ {2}compositor {2}/m);
    expect(out).toMatch(/^app\/\(app\)\/dash\/page\.tsx:2:\d+ {2}engine-boundary/m);
    expect(out).toMatch(/violations · 0 baselined$/m);
  });

  it("a baseline entry silences exactly its line until the line changes", () => {
    const first = lintMotion({ root, baseline: [] }).violations.find((v) => v.file === "src/styles/bad.css" && v.line === 2)!;
    const entry = { file: first.file, rule: first.rule, token: first.token, fingerprint: first.fingerprint };
    const pinned = lintMotion({ root, baseline: [entry] });
    expect(pinned.baselined.map((v) => `${v.file}:${v.line}`)).toEqual(["src/styles/bad.css:2"]);
    expect(pinned.violations.some((v) => v.file === "src/styles/bad.css" && v.line === 2)).toBe(false);
    expect(pinned.stale).toEqual([]);
    const moved = { ...entry, fingerprint: fingerprint(".a { transition: width 300ms ease; }") };
    const lapsed = lintMotion({ root, baseline: [moved] });
    expect(lapsed.violations.some((v) => v.file === "src/styles/bad.css" && v.line === 2)).toBe(true);
    expect(lapsed.stale).toEqual([moved]);
  });
});

describe("lint-motion on the real tree", () => {
  it("passes (npm run motion:lint)", () => {
    const { violations, files } = lintMotion();
    expect(files).toBeGreaterThan(20);
    expect(violations.map((v) => `${v.file}:${v.line}  ${v.rule}  ${v.message}`)).toEqual([]);
  });
});

describe("lint-motion building blocks", () => {
  it("parses transition shorthands", () => {
    expect(transitionProperties("opacity 120ms, transform 180ms var(--ease-snap)")).toEqual(["opacity", "transform"]);
    expect(transitionProperties("120ms")).toEqual(["all"]);
    expect(transitionProperties("none")).toEqual([]);
    expect(transitionProperties("var(--t)")).toBeNull();
    expect(transitionProperties("--grid-alpha 420ms")).toEqual(["--grid-alpha"]);
  });

  it("finds overshoot the y1 < 0 / y2 > 1 rule alone would miss", () => {
    expect(bezierProblems("cubic-bezier(0.2, 1.5, 0.3, 0.9)")).toHaveLength(1); // y1 > 1 overshoots
    expect(bezierProblems("cubic-bezier(0.33, 0, 0.12, 1)")).toEqual([]);
    expect(bezierProblems("cubic-bezier(var(--a), 0, 0, 1)")).toEqual([]);
  });

  it("knows which selectors target the root element", () => {
    expect(targetsRoot(":root")).toBe(true);
    expect(targetsRoot("html.anim-ready")).toBe(true);
    expect(targetsRoot(':root[data-contrast="high"]')).toBe(true);
    expect(targetsRoot("html.anim-ready [data-anim]")).toBe(false);
    expect(targetsRoot(".htmlish")).toBe(false);
  });

  it("parses nested rules, keyframes and at-rule context with line numbers", () => {
    const { decls, keyframes } = parseCss(`@media (x) {\n  .a {\n    &:hover { color: red; }\n  }\n}\n@keyframes k { to { opacity: 1; } }`);
    const color = decls.find((d) => d.prop === "color")!;
    expect(color).toMatchObject({ selector: ".a:hover", line: 3, atRules: [{ name: "media", params: "(x)" }] });
    expect(keyframes).toMatchObject([{ name: "k", props: [{ prop: "opacity", line: 6 }] }]);
  });
});
