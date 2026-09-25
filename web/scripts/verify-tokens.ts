// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// `npm run tokens:verify` — the token CI gate (plan §7 T0 step 6, design §8.1 and
// Appendix A). Build-breaking by design: it exits 1 on any failure and, for an
// APCA failure, prints the token, its measured Lc and the nearest passing value,
// so fixing a token is faster than disabling the gate.
//
// Checks
//   pairs     every OKLCH primitive has a hex/rgba fallback that agrees within 1/255
//             per channel; comment hexes and "N% x over ink-1" derivations agree too
//   gamut     every chromatic oklch() literal in the token files is inside sRGB;
//             prints max in-gamut chroma per (L, h) for sRGB and Display-P3
//   apca      every text-bearing token clears its APCA floor (apca-w3 0.1.9) on the
//             backgrounds it is specified for: Lc 90 primary, 75 body, 60 content
//             text, 45 large text, plus the documented exceptions
//   non-text  meaning-bearing non-text colours reach WCAG 3:1 (SC 1.4.11)
//   ramp      severity chroma is strictly monotone (design §1.6)
//   palette   no green (hue 120–190) outside the .prg-code quarantine (R1); no #FFFFFF
//   refs      every var() resolves in every context; every colour token has a utility

import { APCAcontrast, sRGBtoY } from "apca-w3";
import { clampChroma, converter, inGamut, parse, wcagContrast, type Color, type Oklch } from "culori";
import {
  commentHex,
  layered,
  loadTokens,
  resolveValue,
  tailwindColorName,
  type Context,
  type Decl,
} from "./lib/tokens";

const model = loadTokens(process.cwd());
const toRgb = converter("rgb");
const toOklch = converter("oklch");
const inSrgb = inGamut("rgb");
const inP3 = inGamut("p3");

let failures = 0;
let checks = 0;
const out: string[] = [];
const say = (s = "") => out.push(s);
const pass = (s: string) => {
  checks++;
  say(`  ok    ${s}`);
};
const fail = (s: string) => {
  checks++;
  failures++;
  say(`  FAIL  ${s}`);
};
const info = (s: string) => say(`  info  ${s}`);

// ---------------------------------------------------------------- helpers
const cache = new Map<Context, Map<string, string>>();
function values(ctx: Context) {
  let v = cache.get(ctx);
  if (!v) cache.set(ctx, (v = layered(model, ctx)));
  return v;
}
function resolved(name: string, ctx: Context = "root"): string {
  const raw = values(ctx).get(name);
  if (raw === undefined) throw new Error(`unknown token ${name} (context ${ctx})`);
  return resolveValue(raw, values(ctx));
}
function color(name: string, ctx: Context = "root"): Color {
  const v = resolved(name, ctx);
  const c = parse(v);
  if (!c) throw new Error(`${name} does not resolve to a colour: ${v}`);
  return c;
}
type RGB8 = [number, number, number];
function rgb8(c: Color): RGB8 {
  const r = toRgb(c);
  const q = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  return [q(r.r), q(r.g), q(r.b)];
}
function alpha(c: Color): number {
  return c.alpha ?? 1;
}
/** Composite fg over an opaque bg in 8-bit sRGB (the way a browser paints it). */
function over(fg: Color, bg: RGB8): RGB8 {
  const a = alpha(fg);
  const f = rgb8(fg);
  return [0, 1, 2].map((i) => Math.round(f[i] * a + bg[i] * (1 - a))) as RGB8;
}
function hex(rgb: RGB8) {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function lc(fg: RGB8, bg: RGB8): number {
  return Number(APCAcontrast(sRGBtoY(fg), sRGBtoY(bg)));
}
/** A background spec: a token, or a token composited over another (e.g. a tint over ink-1). */
type Bg = string | { token: string; over: string };
function bgRgb(bg: Bg, ctx: Context): RGB8 {
  if (typeof bg === "string") {
    const c = color(bg, ctx);
    return alpha(c) < 1 ? over(c, rgb8(color("--ink-0", ctx))) : rgb8(c);
  }
  return over(color(bg.token, ctx), rgb8(color(bg.over, ctx)));
}
function bgLabel(bg: Bg) {
  return typeof bg === "string" ? bg : `${bg.token}/${bg.over}`;
}
function maxChroma(l: number, h: number, test: (c: Oklch) => boolean): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (test({ mode: "oklch", l, c: mid, h })) lo = mid;
    else hi = mid;
  }
  return lo;
}
/** Nearest OKLCH lightness (same hue, chroma clamped into sRGB) that reaches `floor` on `bg`. */
function nearestPassing(fgName: string, bg: RGB8, floor: number, ctx: Context): string {
  const base = toOklch(color(fgName, ctx));
  for (let step = 1; step <= 1000; step++) {
    for (const dir of [1, -1]) {
      const l = base.l + (dir * step) / 1000;
      if (l < 0 || l > 1) continue;
      const cand = clampChroma({ mode: "oklch", l, c: base.c, h: base.h ?? 0 }, "oklch") as Oklch;
      const rgb = rgb8(cand);
      const m = Math.abs(lc(rgb, bg));
      if (m >= floor) {
        return `oklch(${cand.l.toFixed(3)} ${cand.c.toFixed(3)} ${Math.round(cand.h ?? 0)}) ${hex(rgb)} (Lc ${m.toFixed(1)})`;
      }
    }
  }
  return "none in gamut";
}

// ---------------------------------------------------------------- 1. pairs
say("pairs — oklch primitives vs hex fallbacks (≤ 1/255 per channel)");
{
  const prim = model.layers.primitive;
  const fb = model.layers.fallback;
  const ink1 = rgb8(color("--ink-1"));
  const ink0 = rgb8(color("--ink-0"));
  for (const [name, d] of prim) {
    if (!/^oklch\(/.test(d.value)) continue;
    const a = parse(d.value);
    const f = fb.get(name);
    if (!a) {
      fail(`${name} does not parse: ${d.value}`);
      continue;
    }
    if (!f) {
      fail(`${name} has no fallback in the @supports not (oklch) block (${d.file}:${d.line})`);
      continue;
    }
    const b = parse(f.value);
    if (!b) {
      fail(`${name} fallback does not parse: ${f.value}`);
      continue;
    }
    const ra = rgb8(a);
    const rb = rgb8(b);
    const dmax = Math.max(...ra.map((v, i) => Math.abs(v - rb[i])));
    const da = Math.abs(alpha(a) - alpha(b));
    if (dmax <= 1 && da < 0.001) pass(`${name.padEnd(20)} ${d.value.padEnd(30)} ≡ ${f.value}`);
    else fail(`${name} ${d.value} renders ${hex(ra)} α${alpha(a)} but its fallback is ${f.value} (Δ${dmax}/255, Δα ${da.toFixed(3)})`);
    // the hex written in the comment must agree as well, so comments cannot rot
    const ch = commentHex(d);
    if (ch && alpha(a) === 1) {
      const rc = rgb8(parse(ch)!);
      const dc = Math.max(...ra.map((v, i) => Math.abs(v - rc[i])));
      if (dc > 1) fail(`${name} comment says ${ch} but ${d.value} renders ${hex(ra)}`);
    }
    // "N% <token> over ink-1": the tint is defined by that composite
    const dm = d.comment ? /(\d+)% (\w[\w-]*) over (ink-\d)/.exec(d.comment) : null;
    if (dm) {
      const pct = Number(dm[1]) / 100;
      const base = dm[3] === "ink-0" ? ink0 : ink1;
      const src = rgb8(color(`--${dm[2]}`));
      const comp = [0, 1, 2].map((i) => Math.round(src[i] * pct + base[i] * (1 - pct))) as RGB8;
      const dd = Math.max(...ra.map((v, i) => Math.abs(v - comp[i])));
      if (dd <= 1) pass(`${name.padEnd(20)} = ${dm[1]}% --${dm[2]} over --${dm[3]} ${hex(comp)}`);
      else fail(`${name} renders ${hex(ra)} but is defined as ${dm[1]}% --${dm[2]} over --${dm[3]} = ${hex(comp)} (Δ${dd}/255)`);
    }
    // alpha hairlines: the documented composite over ink-0
    const om = d.comment ? /over ink-0 (#[0-9A-Fa-f]{6})/.exec(d.comment) : null;
    if (om && alpha(a) < 1) {
      const comp = over(a, ink0);
      const doc = rgb8(parse(om[1])!);
      const dd = Math.max(...comp.map((v, i) => Math.abs(v - doc[i])));
      if (dd <= 1) pass(`${name.padEnd(20)} over --ink-0 = ${hex(comp)}`);
      else fail(`${name} over --ink-0 = ${hex(comp)}, documented ${om[1]} (Δ${dd}/255)`);
    }
  }
  for (const [name, f] of fb) {
    if (!prim.has(name) && !model.layers.derived.has(name)) fail(`fallback ${name} has no primitive (${f.file}:${f.line})`);
  }
}

// ---------------------------------------------------------------- 2. gamut
say("");
say("gamut — every chromatic oklch() literal inside sRGB (max in-gamut chroma per L,h)");
{
  const seen = new Set<string>();
  const literals: { where: string; lit: string }[] = [];
  for (const d of model.decls) {
    for (const m of d.value.matchAll(/oklch\([^()]*\)/g)) {
      const lit = m[0].replace(/\s+/g, " ");
      if (seen.has(lit)) continue;
      seen.add(lit);
      literals.push({ where: d.name, lit });
    }
  }
  for (const { where, lit } of literals) {
    const c = parse(lit) as Oklch | undefined;
    if (!c) {
      fail(`${where}: cannot parse ${lit}`);
      continue;
    }
    if (!c.c || c.c < 1e-4) continue; // achromatic: always in gamut
    const h = c.h ?? 0;
    const cs = maxChroma(c.l, h, (x) => inSrgb(x));
    const cp = maxChroma(c.l, h, (x) => inP3(x));
    const line = `${where.padEnd(20)} ${lit.padEnd(30)} C ${c.c.toFixed(3)} ≤ sRGB max ${cs.toFixed(3)} (P3 max ${cp.toFixed(3)}, headroom ${(100 * (1 - c.c / cs)).toFixed(1)}%)`;
    if (c.c <= cs + 1e-6) pass(line);
    else fail(`${line} — OUTSIDE sRGB: the hex fallback clips and disagrees with oklch() on P3 displays`);
  }
}

// ---------------------------------------------------------------- 3. APCA
say("");
say("apca — Lc (apca-w3 0.1.9) against the backgrounds each token is specified for");
type Tier = "primary" | "body" | "content" | "large" | "exception" | "exempt";
const FLOOR: Record<Exclude<Tier, "exception" | "exempt">, number> = { primary: 90, body: 75, content: 60, large: 45 };
interface Check {
  fg: string;
  bg: Bg[];
  tier: Tier;
  floor?: number; // exception / exempt regression guard
  ctx?: Context;
  why: string;
}
const INKS = ["--ink-0", "--ink-1", "--ink-2"];
const PANE_A = "--signal-tint-lo";
const PANE_B = "--alarm-tint-lo";
const CHECKS: Check[] = [
  // design §8.1: every -text/-body/-primary/-dim token against ink-0, ink-1 and ink-2
  { fg: "--text-primary", bg: INKS, tier: "primary", why: "headlines, readouts (§1.3)" },
  { fg: "--text-body", bg: INKS, tier: "body", why: "all body copy (§1.3)" },
  { fg: "--signal-text", bg: INKS, tier: "body", why: "cyan body text (§1.5)" },
  { fg: "--alarm-text", bg: INKS, tier: "body", why: "red body text (§1.5)" },
  { fg: "--marker-text", bg: INKS, tier: "body", why: "amber body text (§1.5)" },
  { fg: "--diff-add-text", bg: INKS, tier: "body", why: "added line text (§1.10)" },
  { fg: "--text-dim", bg: INKS, tier: "exception", floor: 41.5, why: "documented Lc-45 tier, measured −43.6/−42.5: eyebrows, units, column heads ONLY (§1.3, §8.1)" },
  { fg: "--text-disabled", bg: INKS, tier: "exempt", floor: 20, why: "disabled only, exempt from SC 1.4.3 (§1.3) — regression guard" },
  // documented pairings
  { fg: "--signal", bg: ["--ink-0", "--ink-1"], tier: "content", why: "label text ≥12px/600 only (§1.5)" },
  { fg: "--proof-proven-fg", bg: ["--proof-proven-bg"], tier: "content", why: "PROVEN chip: --ink-0 on solid --signal, Lc 67.7 (§1.7)" },
  { fg: "--proof-disproven-fg", bg: ["--ink-1", "--ink-2"], tier: "content", why: "DISPROVEN outline chip (§1.7)" },
  { fg: "--proof-inconclusive-fg", bg: ["--proof-inconclusive-bg"], tier: "content", why: "INCONCLUSIVE chip (§1.7)" },
  { fg: "--proof-not-attempted-fg", bg: ["--ink-2"], tier: "exempt", floor: 20, why: "NOT ATTEMPTED chip uses --text-disabled (§1.7)" },
  { fg: "--gate-failure-fg", bg: ["--gate-failure-bg"], tier: "content", why: "BLOCKED: --alarm-text on --alarm-tint-hi, Lc −74.6 (ruling 2)" },
  { fg: "--gate-neutral-fg", bg: ["--gate-neutral-bg"], tier: "exception", floor: 41.5, why: "RUNNING gate uses --text-dim (§1.8)" },
  { fg: "--gate-success-fg", bg: ["--gate-success-bg"], tier: "body", why: "CLEAR gate: body text on cyan tint (§1.8)" },
  { fg: "--signal-text", bg: [PANE_A, "--signal-tint"], tier: "body", why: "terminal pane A `passed`, proven row (§5.7)" },
  { fg: "--text-body", bg: [PANE_A, "--signal-tint", "--alarm-tint", "--marker-tint"], tier: "body", why: "body text on tinted rows and panes" },
  { fg: "--alarm-text", bg: [PANE_B, "--alarm-tint"], tier: "body", why: "traceback in pane B, blocking row (§5.7)" },
  { fg: "--alarm-text", bg: ["--alarm-tint-hover"], tier: "content", why: "danger button label on hover (§5.1)" },
  { fg: "--alarm-hi", bg: ["--ink-1", "--ink-2"], tier: "large", why: "large text only: `→ blocks merge` at 20px (§1.5, ruling 2)" },
  { fg: "--marker", bg: ["--ink-0", "--ink-1"], tier: "content", why: "degraded labels, `verification unavailable` line (§1.5)" },
  // code surface (the code container is --ink-1)
  { fg: "--syn-plain", bg: ["--ink-1"], tier: "body", why: "code: plain (§1.12)" },
  { fg: "--syn-keyword", bg: ["--ink-1"], tier: "body", why: "code: keyword (§1.12)" },
  { fg: "--syn-string", bg: ["--ink-1"], tier: "body", why: "code: string (§1.12)" },
  { fg: "--syn-number", bg: ["--ink-1"], tier: "body", why: "code: number (§1.12)" },
  { fg: "--syn-entity", bg: ["--ink-1"], tier: "body", why: "code: entity (§1.12)" },
  { fg: "--syn-comment", bg: ["--ink-1"], tier: "exception", floor: 42.2, why: "the one deliberate sub-floor value, −43.2 † (§1.12)" },
  { fg: "--syn-comment", bg: ["--ink-1"], tier: "body", ctx: "contrast-high", why: "[data-contrast=high] promotes comments to --text-body (§1.12)" },
  { fg: "--diff-add-text", bg: [{ token: "--diff-add-bg", over: "--ink-1" }], tier: "body", why: "added line on its 8% tint (§1.10)" },
  { fg: "--diff-del-text", bg: ["--ink-1", { token: "--diff-del-bg", over: "--ink-1" }], tier: "body", why: "removed line text (§1.10)" },
  { fg: "--diff-add", bg: ["--ink-1", { token: "--diff-add-bg", over: "--ink-1" }], tier: "content", why: "`+` gutter glyph, the semantic channel (§1.10)" },
  { fg: "--diff-del", bg: ["--ink-1"], tier: "exception", floor: 39.6, why: "`−` gutter glyph = --alarm, documented −40.6 (§1.10)" },
  // captured terminal output (anser, use_classes) on both panes and the terminal interior
  ...["--ansi-red", "--ansi-green", "--ansi-yellow", "--ansi-cyan", "--ansi-magenta", "--ansi-white"].map(
    (fg): Check => ({ fg, bg: ["--ink-1", PANE_A, PANE_B], tier: "body", why: "ANSI mapping (§1.12)" }),
  ),
  { fg: "--ansi-blue", bg: ["--ink-1", PANE_A, PANE_B], tier: "content", why: "T0 ruling: the doc gives only the hex (#4FC4D4, Lc −61.9); pytest essentially never emits blue" },
  // chrome
  { fg: "--chart-axis", bg: ["--ink-0", "--ink-1"], tier: "exception", floor: 41.5, why: "axis labels use --text-dim (dashboard §7)" },
  { fg: "--foreground", bg: ["--background"], tier: "body", why: "shadcn foreground/background" },
  { fg: "--card-foreground", bg: ["--card"], tier: "body", why: "shadcn card" },
  { fg: "--popover-foreground", bg: ["--popover"], tier: "body", why: "shadcn popover (--ink-3)" },
  { fg: "--secondary-foreground", bg: ["--secondary"], tier: "body", why: "shadcn secondary" },
  { fg: "--accent-foreground", bg: ["--accent"], tier: "primary", why: "shadcn accent (hover rung)" },
  { fg: "--primary-foreground", bg: ["--primary"], tier: "content", why: "shadcn primary (button label, 11px/500 caps)" },
  { fg: "--muted-foreground", bg: ["--muted"], tier: "exception", floor: 41.5, why: "shadcn muted = --text-dim on --ink-2" },
];
for (const chk of CHECKS) {
  const ctx = chk.ctx ?? "root";
  const floor = chk.tier === "exception" || chk.tier === "exempt" ? chk.floor! : FLOOR[chk.tier];
  for (const bg of chk.bg) {
    const b = bgRgb(bg, ctx);
    const fgc = color(chk.fg, ctx);
    const f = alpha(fgc) < 1 ? over(fgc, b) : rgb8(fgc);
    const m = lc(f, b);
    const label = `${chk.fg} on ${bgLabel(bg)}${ctx !== "root" ? ` [${ctx}]` : ""}`;
    const line = `${label.padEnd(52)} Lc ${m.toFixed(1).padStart(6)}  ≥ ${String(floor).padEnd(4)} ${chk.tier.padEnd(9)} ${chk.why}`;
    if (Math.abs(m) >= floor) pass(line);
    else fail(`${line}\n          nearest passing value: ${nearestPassing(chk.fg, b, floor, ctx)}`);
  }
}
info("rows (not asserted; outside the §8.1 matrix):");
for (const fg of ["--text-primary", "--text-body", "--text-dim"]) {
  const parts = ["--ink-3", "--ink-4"].map((bg) => `${bg} Lc ${lc(rgb8(color(fg)), rgb8(color(bg))).toFixed(1)}`);
  info(`  ${fg.padEnd(16)} ${parts.join("   ")}${fg === "--text-body" ? "   ← selected rows (ink-4) sit 0.5 under the body floor" : ""}`);
}

// ---------------------------------------------------------------- 4. non-text
say("");
say("non-text — meaning-bearing colours ≥ 3:1 (WCAG 2.x, SC 1.4.11)");
{
  const pairs: [string, string, Context?][] = [
    ["--ink-7", "--ink-0"],
    ["--ring", "--ink-0"],
    ["--ring", "--ink-2"],
    ["--hc-rule-3", "--ink-0"],
    ["--rule-1", "--ink-0", "contrast-high"],
    ["--rule-hair", "--ink-0", "contrast-high"],
    ["--sev-info", "--ink-0"],
    ["--sev-low", "--ink-0"],
    ["--sev-medium", "--ink-0"],
    ["--sev-high", "--ink-0"],
    ["--sev-critical", "--ink-0"],
    ["--stage-running-node", "--ink-0"],
    ["--stage-done-node", "--ink-0"],
    ["--stage-degraded-node", "--ink-0"],
    ["--stage-failed-node", "--ink-0"],
    ["--chart-proven", "--ink-0"],
    ["--chart-disproven", "--ink-0"],
    ["--chart-inconclusive", "--ink-0"],
    ["--chart-not-attempted", "--ink-0"],
    ["--chart-reference", "--ink-0"],
    ["--heartbeat-live", "--ink-1"],
    ["--heartbeat-stale", "--ink-1"],
    ["--status-suppressed-border", "--ink-0"],
    ["--proof-disproven-border", "--ink-1"],
  ];
  for (const [fg, bg, ctx = "root"] of pairs) {
    const b = rgb8(color(bg, ctx));
    const fc = color(fg, ctx);
    const f = alpha(fc) < 1 ? over(fc, b) : rgb8(fc);
    const r = wcagContrast({ mode: "rgb", r: f[0] / 255, g: f[1] / 255, b: f[2] / 255 }, { mode: "rgb", r: b[0] / 255, g: b[1] / 255, b: b[2] / 255 });
    const line = `${`${fg} vs ${bg}${ctx !== "root" ? ` [${ctx}]` : ""}`.padEnd(52)} ${r.toFixed(2)}:1`;
    if (r >= 3) pass(line);
    else fail(`${line} < 3:1`);
  }
}

// ---------------------------------------------------------------- 5. ramp
say("");
say("ramp — severity chroma strictly monotone (design §1.6)");
{
  const ramp = ["--sev-info", "--sev-low", "--sev-medium", "--sev-high", "--sev-critical"];
  const cs = ramp.map((n) => toOklch(color(n)).c);
  const ok = cs.every((c, i) => i === 0 || c > cs[i - 1]);
  const line = ramp.map((n, i) => `${n.slice(6)} ${cs[i].toFixed(3)}`).join(" < ");
  if (ok) pass(line);
  else fail(`${line} — not strictly increasing`);
}

// ---------------------------------------------------------------- 6. palette discipline
say("");
say("palette — no green outside the .prg-code quarantine (R1), never #FFFFFF");
{
  const QUARANTINE = /^--(diff-add|syn-number|ansi-green|color-diff-add|color-syn-number|color-ansi-green)/;
  let greens = 0;
  let whites = 0;
  for (const [name] of values("root")) {
    let c: Color | undefined;
    try {
      c = parse(resolved(name));
    } catch {
      continue;
    }
    if (!c) continue;
    const o = toOklch(c);
    if (o.c >= 0.02 && o.h !== undefined && o.h >= 120 && o.h <= 190 && !QUARANTINE.test(name)) {
      greens++;
      fail(`${name} is green (h ${o.h.toFixed(0)}, C ${o.c.toFixed(3)}) outside the diff/code quarantine`);
    }
    if (alpha(c) === 1 && hex(rgb8(c)) === "#FFFFFF") {
      whites++;
      fail(`${name} resolves to #FFFFFF`);
    }
  }
  if (!greens) pass("no hue 120–190 outside diff-add*, syn-number, ansi-green");
  if (!whites) pass("no token resolves to #FFFFFF");
}

// ---------------------------------------------------------------- 7. references and registration
say("");
say("refs — every var() resolves; every colour token has a Tailwind utility");
{
  const contexts: Context[] = ["root", "app", "marketing", "contrast-high", "app+contrast-high"];
  let dangling = 0;
  for (const ctx of contexts) {
    for (const [name] of values(ctx)) {
      const v = resolved(name, ctx);
      if (v.includes("var(")) {
        dangling++;
        fail(`${name} [${ctx}] does not fully resolve: ${v}`);
      }
    }
  }
  if (!dangling) pass(`all tokens resolve in ${contexts.join(", ")}`);
  let missing = 0;
  const colourish = (d: Decl) => {
    try {
      return !!parse(resolved(d.name));
    } catch {
      return false;
    }
  };
  for (const d of [...model.layers.primitive.values(), ...model.layers.derived.values()]) {
    if (!colourish(d)) continue;
    if (!tailwindColorName(model, d.name)) {
      missing++;
      fail(`${d.name} is a colour but has no --color-* mapping in @theme (no bg-/text-/border- utility)`);
    }
  }
  for (const d of model.layers.theme.values()) {
    const m = /^var\((--[\w-]+)\)$/.exec(d.value);
    if (d.name.startsWith("--color-") && m && !values("root").has(m[1])) {
      missing++;
      fail(`${d.name} maps to ${m[1]}, which is not a token`);
    }
  }
  if (!missing) pass("every colour token is registered; every --color-* mapping points at a token");
}

// ---------------------------------------------------------------- report
console.log(out.join("\n"));
console.log("");
if (failures) {
  console.log(`tokens:verify FAILED — ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`tokens:verify OK — ${checks} checks passed (${model.decls.length} declarations in ${model.files.join(", ")})`);
