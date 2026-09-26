// OWNER: t1c (wave 1). Test helper: resolve a Tailwind colour utility back to the design
// token it paints with, by reading app/tokens/core.css itself. So a test can assert "the
// BLOCKED gate's background is --alarm-tint-hi, never --alarm" against the real stylesheet
// instead of against a copy of it.
//
//   resolveColor("bg-gate-failure-bg")   → { prop: "bg", chain: ["--gate-failure-bg", "--alarm-tint-hi"], token: "--alarm-tint-hi" }
//   resolveColor("border-dashed")        → null (not a colour utility)
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS = readFileSync(path.resolve(import.meta.dirname, "../../../app/tokens/core.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** First declaration of every custom property, in file order: layers A and B, the default dark theme. */
const DECLS = new Map<string, string>();
for (const m of CSS.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
  const [, name, value] = m;
  if (!DECLS.has(name)) DECLS.set(name, value.trim());
}

/** Colour names Tailwind knows (`@theme inline static` registers `--color-<name>`). */
export const THEME_COLORS = new Set([...DECLS.keys()].filter((n) => n.startsWith("--color-")).map((n) => n.slice("--color-".length)));

const PREFIXES = [
  ["border-t-", "border-t"],
  ["border-b-", "border-b"],
  ["border-l-", "border-l"],
  ["border-r-", "border-r"],
  ["border-x-", "border-x"],
  ["border-y-", "border-y"],
  ["border-", "border"],
  ["bg-", "bg"],
  ["text-", "text"],
  ["fill-", "fill"],
  ["stroke-", "stroke"],
  ["outline-", "outline"],
  ["decoration-", "decoration"],
] as const;

export type ColorProp = (typeof PREFIXES)[number][1];
export type Resolved = { cls: string; prop: ColorProp; chain: string[]; token: string };

/** Follow var() references from a token to the last named token before a literal. */
export function chainOf(token: string): string[] {
  const chain = [token];
  let value = DECLS.get(token);
  while (value) {
    const m = /^var\((--[a-z0-9-]+)\)$/i.exec(value);
    if (!m) break;
    chain.push(m[1]);
    value = DECLS.get(m[1]);
  }
  return chain;
}

/** The literal a token finally resolves to (an oklch() in the default theme). */
export function literalOf(token: string): string | undefined {
  const chain = chainOf(token);
  return DECLS.get(chain[chain.length - 1]);
}

/**
 * The colour a utility class paints with, or null when the class is not a colour utility.
 * Variants (`hover:`, `forced-colors:` …) are stripped: a colour behind a variant still counts.
 * `transparent` and `current` resolve to themselves.
 */
export function resolveColor(cls: string): Resolved | null {
  const util = cls.slice(cls.lastIndexOf(":") + 1);
  for (const [prefix, prop] of PREFIXES) {
    if (!util.startsWith(prefix)) continue;
    const name = util.slice(prefix.length);
    if (name === "transparent" || name === "current") return { cls, prop, chain: [name], token: name };
    if (!THEME_COLORS.has(name)) continue;
    const chain = chainOf(`--${name}`);
    const last = chain[chain.length - 1];
    // a semantic token defined as the literal `transparent` (e.g. --proof-proven-border)
    return { cls, prop, chain, token: DECLS.get(last) === "transparent" ? "transparent" : last };
  }
  return null;
}

/** Every colour utility on one element. */
export function colorsOf(el: Element): Resolved[] {
  return [...el.classList].map(resolveColor).filter((r): r is Resolved => r !== null);
}

/** The single token an element's utilities paint `prop` with (throws if there are two). */
export function tokenFor(el: Element, prop: ColorProp): string | undefined {
  const found = colorsOf(el).filter((r) => r.prop === prop && !r.cls.includes(":"));
  if (found.length > 1) throw new Error(`${prop} is set twice on <${el.tagName.toLowerCase()} class="${el.className}">`);
  return found[0]?.token;
}

/** Does this token (through any alias) end at the same literal as `target`? */
export function sameLiteral(token: string, target: string): boolean {
  if (token === "transparent" || token === "current") return false;
  return literalOf(token) === literalOf(target);
}
