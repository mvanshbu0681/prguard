// @vitest-environment node
// OWNER: t1d. The stylesheet contract of src/styles/code.css, read as data.
//   - long lines never wrap (white-space: pre on every pre; nothing that breaks words);
//   - the quarantine: diff green / diff red / ANSI green only ever style the three scopes;
//   - --alarm is a fill, never a text colour; no shadows; no literal colours;
//   - transitions are compositor-only and use the motion tokens;
//   - every class the components emit has a rule, and tones beat captured ANSI colour.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCss, type Rule } from "../../../scripts/lib/tokens";
import { ANSI_FAMILIES } from "@/components/code/terminal/ansi";
import { RAIL_TONES, TEXT_TONES } from "@/components/code/shared/types";
import { SYNTAX_ROLES } from "@/components/code/shiki/theme";

const css = readFileSync(fileURLToPath(new URL("../../../src/styles/code.css", import.meta.url)), "utf8");
const rules = parseCss(css).filter((r) => !r.prelude.startsWith("@"));
const decls = rules.flatMap((r) => r.decls.map((d) => ({ rule: r, ...d })));

/** Split a selector list on top-level commas (not the ones inside :where()/:is()). */
function selectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of prelude) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const SCOPED = /\.prg-(?:terminal|code|diff)(?:__[a-z-]+)?(?![\w-])/;
const ruleFor = (prelude: string): Rule | undefined => rules.find((r) => r.prelude === prelude);
const has = (r: Rule | undefined, name: string, value?: string) =>
  !!r?.decls.some((d) => d.name === name && (value === undefined || d.value === value));

describe("code.css — never wrap", () => {
  it("sets white-space: pre on every pre", () => {
    const pres = rules.filter((r) => /__pre\b/.test(r.prelude) && r.decls.some((d) => d.name === "white-space"));
    expect(pres.length).toBeGreaterThan(0);
    for (const r of pres) expect(r.decls.find((d) => d.name === "white-space")?.value).toBe("pre");
    const shared = rules.find((r) => r.prelude.startsWith(":where(.prg-terminal__pre, .prg-code__pre, .prg-diff__pre)"));
    expect(has(shared, "white-space", "pre")).toBe(true);
    expect(has(shared, "inline-size", "max-content")).toBe(true);
    expect(has(shared, "min-inline-size", "100%")).toBe(true);
  });

  it("scrolls the viewports on both axes", () => {
    const viewport = ruleFor(":where(.prg-terminal__viewport, .prg-code__viewport, .prg-diff__viewport)");
    expect(has(viewport, "overflow", "auto")).toBe(true);
  });

  it("declares nothing anywhere that would break a line of code", () => {
    for (const d of decls) {
      if (d.name === "white-space" && d.rule.prelude !== ".prg-diff__annotation") {
        expect(["pre", "nowrap", "inherit"], `${d.rule.prelude} { white-space: ${d.value} }`).toContain(d.value);
      }
      if (d.name === "overflow-wrap") expect(d.value, d.rule.prelude).toBe("normal");
      if (d.name === "word-break") expect(d.value, d.rule.prelude).toBe("normal");
      expect(d.name).not.toBe("line-break");
      expect(d.name).not.toBe("text-wrap");
    }
  });

  it("sets 13px / 22px, tracking 0 and no ligatures, and 12px / 20px for the terminal below 768px", () => {
    const root = ruleFor(":where(.prg-terminal, .prg-code, .prg-diff)");
    expect(has(root, "--prg-fs", "var(--fs-terminal)")).toBe(true);
    expect(has(root, "--prg-lh", "var(--lh-terminal)")).toBe(true);
    expect(has(root, "letter-spacing", "0")).toBe(true);
    expect(has(root, "font-variant-ligatures", "none")).toBe(true);
    const mobile = parseCss(css).find((r) => r.prelude === ".prg-terminal" && r.atRules.some((a) => a.includes("max-width: 767.98px")));
    expect(has(mobile, "--prg-fs", "0.75rem")).toBe(true);
    expect(has(mobile, "--prg-lh", "20px")).toBe(true);
  });
});

describe("code.css — the quarantine and the palette rules", () => {
  const QUARANTINED = /var\(--(?:diff-add(?:-text|-bg)?|diff-del(?:-text|-bg)?|ansi-green|syn-number)\)/;

  it("writes every diff green, diff red and ANSI green under a code-surface scope", () => {
    const offenders = decls.filter((d) => QUARANTINED.test(d.value)).filter((d) => !selectors(d.rule.prelude).every((s) => SCOPED.test(s)));
    expect(offenders.map((d) => `${d.rule.prelude} { ${d.name}: ${d.value} }`)).toEqual([]);
    expect(decls.filter((d) => QUARANTINED.test(d.value)).length).toBeGreaterThan(0);
  });

  it("scopes every rule to a code surface", () => {
    const unscoped = rules.filter((r) => !selectors(r.prelude).every((s) => SCOPED.test(s)));
    expect(unscoped.map((r) => r.prelude)).toEqual([]);
  });

  it("never uses --alarm (or its --diff-del alias) as a text colour", () => {
    const text = decls.filter((d) => d.name === "color" && /var\(--(?:alarm|diff-del)\)/.test(d.value));
    expect(text.map((d) => d.rule.prelude)).toEqual([]);
  });

  it("uses tokens, not literal colours (the hover wash and forced-colors keywords excepted)", () => {
    const literal = decls.filter((d) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(d.value) || (/oklch\(/.test(d.value) && d.value !== "oklch(1 0 0 / 0.04)"));
    expect(literal.map((d) => `${d.rule.prelude} { ${d.name}: ${d.value} }`)).toEqual([]);
  });

  it("has no shadows", () => {
    expect(decls.filter((d) => /shadow/.test(d.name)).map((d) => d.rule.prelude)).toEqual([]);
  });

  it("transitions only compositor properties, on motion tokens", () => {
    const transitions = decls.filter((d) => d.name.startsWith("transition") || d.name.startsWith("animation"));
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) {
      expect(t.value).toMatch(/^(?:opacity|transform) var\(--dur-\d\) var\(--ease-(?:snap|instrument|exit)\)$/);
    }
    expect(css).not.toMatch(/cubic-bezier\(/);
  });
});

describe("code.css — every emitted class has a rule", () => {
  it("styles all eight ANSI families as fg and bg, and every decoration class", () => {
    for (const family of ANSI_FAMILIES) {
      expect(css, `fg ${family}`).toContain(`.prg-ansi-fg-${family} {`);
      expect(css, `bg ${family}`).toContain(`.prg-ansi-bg-${family}`);
    }
    for (const cls of ["bold", "dim", "italic", "underline", "strike", "hidden"]) expect(css).toContain(`.prg-ansi-${cls}`);
  });

  it("styles every text tone after the ANSI block, so rules beat captured colour", () => {
    const lastAnsi = rules.findLastIndex((r) => r.prelude.includes(".prg-ansi-"));
    for (const tone of TEXT_TONES) {
      const index = rules.findIndex((r) => r.prelude === `.prg-terminal [data-tone="${tone}"]`);
      expect(index, tone).toBeGreaterThan(lastAnsi);
      expect(rules[index].decls[0].name).toBe("color");
    }
    // text tones are text tokens: alarm is --alarm-text, never the fill
    expect(ruleFor('.prg-terminal [data-tone="alarm"]')?.decls[0].value).toBe("var(--alarm-text)");
    expect(ruleFor('.prg-terminal [data-tone="signal"]')?.decls[0].value).toBe("var(--signal-text)");
  });

  it("maps every rail tone to a fill token", () => {
    for (const tone of RAIL_TONES) {
      const rule = rules.find((r) => r.prelude.includes(`.prg-terminal[data-rail="${tone}"]`) && r.prelude.includes(`.prg-code__line[data-hl="${tone}"]`));
      expect(rule, tone).toBeDefined();
      expect(rule?.decls[0]).toMatchObject({ name: "--prg-rail-color" });
    }
  });

  it("styles every syntax role except plain (the default colour of a line)", () => {
    for (const role of SYNTAX_ROLES) {
      if (role === "plain") continue;
      expect(css, role).toContain(`.prg-code .prg-syn-${role} {`);
    }
  });

  it("draws the +/− glyphs with alt text, U+2212 for removed", () => {
    expect(css).toContain('content: "+" / "added: ";');
    expect(css).toContain('content: "\\2212" / "removed: ";');
  });
});
