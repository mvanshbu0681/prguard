// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// A small, dependency-free reader for app/tokens/*.css. It understands exactly
// the structure those files use (see the header of app/tokens/core.css) and is
// shared by scripts/verify-tokens.ts (the CI gate) and app/(lab)/lab/tokens
// (the specimen page), so both always describe the same tokens.

import { readFileSync } from "node:fs";
import path from "node:path";

export type Layer =
  | "primitive" // A — :root literals
  | "derived" // B — :root, [data-surface], [data-theme], [data-contrast]
  | "fallback" // C — @supports not (color: oklch(0 0 0))
  | "surface-app" // D — [data-surface="app"]
  | "surface-marketing" // marketing.css — [data-surface="marketing"]
  | "contrast-high" // E — [data-contrast="high"] …
  | "theme" // @theme blocks (Tailwind registration)
  | "media" // @media variants of primitives (e.g. hairline at 2dppx)
  | "utility"; // @utility blocks (type scale)

export interface Decl {
  name: string;
  value: string;
  layer: Layer;
  group: string;
  comment: string | null;
  file: string;
  line: number;
  /** For "theme" / "utility": the block prelude, e.g. `@theme inline static` or `@utility type-body`. */
  block: string;
}

export interface Rule {
  prelude: string;
  atRules: string[];
  decls: { name: string; value: string; line: number; comment: string | null; group: string }[];
}

/** Minimal CSS block parser: comments, strings, nested blocks, declarations. */
export function parseCss(css: string): Rule[] {
  const rules: Rule[] = [];
  type Frame = { prelude: string; rule: Rule; group: string };
  const stack: Frame[] = [];
  let buf = "";
  let bufLine = 1;
  let line = 1;
  let paren = 0;
  let lastDecl = null as Rule["decls"][number] | null;
  let lastDeclLine = -1;
  let group = "";

  const flushDecl = () => {
    const text = buf.trim();
    buf = "";
    if (!text || stack.length === 0) return;
    const idx = text.indexOf(":");
    if (idx <= 0) return;
    const name = text.slice(0, idx).trim();
    const value = text.slice(idx + 1).trim();
    const top = stack[stack.length - 1];
    const d = { name, value, line: bufLine, comment: null as string | null, group: top.group };
    top.rule.decls.push(d);
    lastDecl = d;
    lastDeclLine = line;
  };

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "\n") line++;
    // comments
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const body = css.slice(i + 2, end === -1 ? css.length : end);
      const startLine = line;
      for (const c of body) if (c === "\n") line++;
      i = end === -1 ? css.length : end + 1;
      const text = body.trim();
      const g = /^@group\s+([\s\S]+)$/.exec(text);
      if (g && stack.length > 0) {
        group = g[1].replace(/\s+/g, " ").trim();
        stack[stack.length - 1].group = group;
      } else if (lastDecl && startLine === lastDeclLine && buf.trim() === "") {
        lastDecl.comment = text.replace(/\s+/g, " ");
      }
      continue;
    }
    // strings
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) {
        if (css[j] === "\\") j++;
        j++;
      }
      if (buf.trim() === "") bufLine = line;
      buf += css.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === "(") paren++;
    if (ch === ")") paren--;
    if (ch === "{" && paren === 0) {
      const prelude = buf.trim().replace(/\s+/g, " ");
      buf = "";
      const atRules = stack.filter((f) => f.prelude.startsWith("@")).map((f) => f.prelude);
      const rule: Rule = { prelude, atRules, decls: [] };
      rules.push(rule);
      stack.push({ prelude, rule, group: stack.length ? stack[stack.length - 1].group : group });
      lastDecl = null;
      continue;
    }
    if (ch === "}" && paren === 0) {
      flushDecl();
      stack.pop();
      lastDecl = null;
      continue;
    }
    if (ch === ";" && paren === 0) {
      flushDecl();
      continue;
    }
    if (buf.trim() === "" && !/\s/.test(ch)) bufLine = line;
    buf += ch;
  }
  return rules;
}

const DERIVED_SELECTOR = ":root, [data-surface], [data-theme], [data-contrast]";

function classify(rule: Rule): Layer | null {
  const p = rule.prelude;
  const inSupportsNot = rule.atRules.some((a) => /^@supports not \(color: oklch/.test(a));
  const inMedia = rule.atRules.some((a) => a.startsWith("@media"));
  if (p.startsWith("@theme")) return "theme";
  if (p.startsWith("@utility")) return "utility";
  if (p.startsWith("@")) return null;
  if (inSupportsNot) return "fallback";
  if (inMedia) return p === ":root" ? "media" : null;
  if (rule.atRules.length > 0) return null; // e.g. @layer components rules are not tokens
  if (p === ":root") return "primitive";
  if (p === DERIVED_SELECTOR) return "derived";
  if (p === '[data-surface="app"]') return "surface-app";
  if (p === '[data-surface="marketing"]') return "surface-marketing";
  if (p.startsWith('[data-contrast="high"]')) return "contrast-high";
  return null;
}

export interface TokenModel {
  decls: Decl[];
  layers: Record<Layer, Map<string, Decl>>;
  /** Ordered groups of short-name tokens as authored (A, B, marketing). */
  groups: { title: string; layer: Layer; names: string[] }[];
  files: string[];
}

export const TOKEN_FILES = ["app/tokens/core.css", "app/tokens/marketing.css"] as const;

export function loadTokens(webRoot: string = process.cwd()): TokenModel {
  const layers = Object.fromEntries(
    (["primitive", "derived", "fallback", "surface-app", "surface-marketing", "contrast-high", "theme", "media", "utility"] as Layer[]).map(
      (l) => [l, new Map<string, Decl>()],
    ),
  ) as Record<Layer, Map<string, Decl>>;
  const decls: Decl[] = [];
  const groups: TokenModel["groups"] = [];
  for (const rel of TOKEN_FILES) {
    // turbopackIgnore: only the lab specimen (a build-time, dev-only page) and the
    // verify script read these; tracing them must not pull the whole project in.
    const css = readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ webRoot, rel), "utf8");
    for (const rule of parseCss(css)) {
      const layer = classify(rule);
      if (!layer) continue;
      for (const d of rule.decls) {
        if (layer !== "utility" && !d.name.startsWith("--")) continue;
        const decl: Decl = { ...d, layer, file: rel, block: rule.prelude };
        decls.push(decl);
        const key = layer === "utility" ? `${rule.prelude.replace("@utility ", "")}::${d.name}` : d.name;
        layers[layer].set(key, decl);
        if (layer === "primitive" || layer === "derived" || layer === "surface-marketing") {
          const last = groups[groups.length - 1];
          if (last && last.title === d.group && last.layer === layer) last.names.push(d.name);
          else groups.push({ title: d.group, layer, names: [d.name] });
        }
      }
    }
  }
  return { decls, layers, groups, files: [...TOKEN_FILES] };
}

export type Context = "root" | "app" | "marketing" | "contrast-high" | "app+contrast-high";

/** Raw (unresolved) values for one element in the given context, override order as in CSS. */
export function layered(model: TokenModel, ctx: Context): Map<string, string> {
  const out = new Map<string, string>();
  const put = (l: Layer) => model.layers[l].forEach((d, k) => out.set(k, d.value));
  put("primitive");
  put("derived");
  if (ctx === "app" || ctx === "app+contrast-high") put("surface-app");
  if (ctx === "marketing") put("surface-marketing");
  if (ctx === "contrast-high" || ctx === "app+contrast-high") put("contrast-high");
  return out;
}

/** Substitute var(--x[, fallback]) recursively. Unknown vars keep their fallback or stay as-is. */
export function resolveValue(value: string, values: Map<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle while resolving: ${value}`);
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("var(", i);
    if (at === -1) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    let j = at + 4;
    let depthP = 1;
    while (j < value.length && depthP > 0) {
      if (value[j] === "(") depthP++;
      if (value[j] === ")") depthP--;
      j++;
    }
    const inner = value.slice(at + 4, j - 1);
    const comma = inner.indexOf(",");
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? null : inner.slice(comma + 1).trim();
    const v = values.get(name);
    if (v !== undefined) out += resolveValue(v, values, depth + 1);
    else if (fallback !== null) out += resolveValue(fallback, values, depth + 1);
    else out += `var(${inner})`;
    i = j;
  }
  return out;
}

export function resolveToken(model: TokenModel, name: string, ctx: Context = "root"): string {
  const values = layered(model, ctx);
  const v = values.get(name);
  if (v === undefined) throw new Error(`unknown token ${name}`);
  return resolveValue(v, values);
}

/** The Tailwind utility root for a colour token, if one is registered (e.g. --ink-0 → "ink-0"). */
export function tailwindColorName(model: TokenModel, name: string): string | null {
  for (const d of model.layers.theme.values()) {
    if (d.name.startsWith("--color-") && d.value === `var(${name})`) return d.name.slice("--color-".length);
  }
  return null;
}

/** Hex written in a declaration's trailing comment, e.g. `/* #080A0D page background *\/`. */
export function commentHex(d: Decl | undefined): string | null {
  const m = d?.comment ? /^(#[0-9A-Fa-f]{6})\b/.exec(d.comment) : null;
  return m ? m[1].toUpperCase() : null;
}

export function isColorValue(v: string): boolean {
  return /^(oklch|rgba?|hsla?|color)\(|^#[0-9a-f]{3,8}$|^transparent$/i.test(v.trim());
}
