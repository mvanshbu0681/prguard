// @vitest-environment node
// OWNER: t1d. Only the ten listed Shiki languages are bundled, through the core API and the
// JavaScript regex engine, and the theme resolves every token to a --syn-* role.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { highlightCode, loadedLanguages } from "@/components/code/shiki/highlighter";
import { LANGUAGE_LOADERS, resolveLanguage, SUPPORTED_LANGUAGES, extensionOf } from "@/components/code/shiki/languages";
import { PRGUARD_COLD_THEME, ROLE_TOKEN, roleForColor, SYNTAX_ROLES } from "@/components/code/shiki/theme";
import { normaliseCode, plainLines } from "@/components/code/shiki/tokens";

const LISTED = ["python", "typescript", "tsx", "javascript", "json", "bash", "yaml", "toml", "markdown", "diff"];

const root = fileURLToPath(new URL("../../../src/components/code", import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|mts)$/.test(name) ? [p] : [];
  });
}
/** Every module specifier (static import/export, dynamic import) in the code surfaces. */
const specifiers = sources(root).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => ({ file: path.relative(root, file), spec: m[1] }));
});

describe("bundle discipline (static)", () => {
  it("imports exactly the ten listed grammars, one module each", () => {
    const langs = specifiers.filter((s) => s.spec.startsWith("@shikijs/langs")).map((s) => s.spec);
    expect(langs.sort()).toEqual(LISTED.map((l) => `@shikijs/langs/${l}`).sort());
    expect(SUPPORTED_LANGUAGES).toEqual(LISTED);
    expect(Object.keys(LANGUAGE_LOADERS).sort()).toEqual([...LISTED].sort());
  });

  it("never imports the shiki barrel, a bundle, WASM or the oniguruma engine", () => {
    const shiki = specifiers.filter((s) => /^(?:shiki|@shikijs\/)/.test(s.spec)).map((s) => s.spec);
    const allowed = new Set(["shiki/core", "shiki/engine/javascript", ...LISTED.map((l) => `@shikijs/langs/${l}`)]);
    expect(shiki.filter((s) => !allowed.has(s))).toEqual([]);
    for (const banned of ["shiki", "shiki/bundle/full", "shiki/bundle/web", "shiki/wasm", "shiki/langs", "@shikijs/langs", "shiki/engine/oniguruma"]) {
      expect(shiki).not.toContain(banned);
    }
  });

  it("loads Shiki itself lazily: no static runtime import of shiki/core outside type positions", () => {
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      const staticRuntime = [...text.matchAll(/^import\s+(?!type\b)[^;]*from\s+["'](shiki[^"']*)["']/gm)];
      expect(staticRuntime.map((m) => `${path.relative(root, file)}: ${m[1]}`)).toEqual([]);
    }
  });
});

describe("bundle discipline (runtime)", () => {
  const SAMPLES: Record<string, string> = {
    python: 'def f(x):\n    return x == "usd"  # c',
    typescript: "const n: number = 1; // c",
    tsx: "export const A = () => <span>{1}</span>;",
    javascript: "const s = `x${1}`;",
    json: '{ "seq": 1428, "ok": true }',
    bash: 'pytest -q "tests/x.py" && echo done # c',
    yaml: "gate:\n  block_on: proven # c",
    toml: '[tool]\nkey = "v"\nn = 3',
    markdown: "### Title\n\nsome `code`",
    diff: "@@ -1,1 +1,1 @@\n-old\n+new",
  };

  it("highlights every listed language, and only those are ever loaded", async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const lines = await highlightCode(SAMPLES[lang], lang);
      expect(lines.map((l) => l.map((t) => t.text).join("")).join("\n"), lang).toBe(normaliseCode(SAMPLES[lang]));
      expect(lines.flat().some((t) => t.role !== "plain"), `${lang} has colour`).toBe(true);
      for (const t of lines.flat()) expect(SYNTAX_ROLES).toContain(t.role);
    }
    const loaded = await loadedLanguages();
    // Shiki reports grammar names and their aliases; bash is the shellscript grammar.
    const grammarNames = new Set(["python", "typescript", "tsx", "javascript", "json", "shellscript", "yaml", "toml", "markdown", "diff"]);
    const unexpected = loaded.filter((name) => !grammarNames.has(name) && !["py", "ts", "js", "cjs", "mjs", "bash", "sh", "shell", "zsh", "yml", "md", "cts", "mts"].includes(name));
    expect(unexpected).toEqual([]);
  });

  it("assigns the roles the palette promises", async () => {
    const [line] = await highlightCode('assert charge(acct, 1200).currency == "usd"  # repro', "python");
    const role = (text: string) => line.find((t) => t.text.includes(text))?.role;
    expect(role("assert")).toBe("keyword");
    expect(role("charge")).toBe("entity");
    expect(role("1200")).toBe("number");
    expect(role('"usd"')).toBe("string");
    expect(role("# repro")).toBe("comment");
    expect(role("==")).toBe("keyword");
  });

  it("keeps shell arguments plain instead of painting a command amber", async () => {
    const [line] = await highlightCode("set -euo pipefail", "bash");
    expect(line.find((t) => t.text.includes("pipefail"))?.role).toBe("plain");
  });

  it("does not tokenise absurdly long lines, and keeps them whole", async () => {
    const blob = `x = "${"a".repeat(6000)}"`;
    const lines = await highlightCode(blob, "python");
    expect(lines).toHaveLength(1);
    expect(lines[0].map((t) => t.text).join("")).toBe(blob);
  });
});

describe("prguard-cold theme", () => {
  it("rewrites every role to its token, and maps tokens back to roles", () => {
    for (const role of SYNTAX_ROLES) {
      expect(Object.values(PRGUARD_COLD_THEME.colorReplacements ?? {})).toContain(ROLE_TOKEN[role]);
      expect(roleForColor(ROLE_TOKEN[role])).toBe(role);
    }
    expect(ROLE_TOKEN.keyword).toBe("var(--syn-keyword)");
    expect(ROLE_TOKEN.entity).toBe("var(--syn-entity)");
    expect(roleForColor(undefined)).toBe("plain");
    expect(roleForColor("#ffffff")).toBe("plain");
  });

  it("carries no display colour of its own: every theme colour is a sentinel that gets replaced", () => {
    const replaced = new Set(Object.keys(PRGUARD_COLD_THEME.colorReplacements ?? {}));
    const used = [
      ...(PRGUARD_COLD_THEME.settings ?? []).flatMap((s) => [s.settings.foreground, s.settings.background]),
      ...Object.values(PRGUARD_COLD_THEME.colors ?? {}),
    ].filter(Boolean);
    for (const c of used) expect(replaced.has(String(c).toLowerCase()), String(c)).toBe(true);
  });
});

describe("languages", () => {
  it("resolves names, aliases and extensions; everything else is null", () => {
    expect(resolveLanguage("py")).toBe("python");
    expect(resolveLanguage("Python")).toBe("python");
    expect(resolveLanguage("sh")).toBe("bash");
    expect(resolveLanguage("jsx")).toBe("javascript");
    expect(resolveLanguage(null, "web/src/verdict.tsx")).toBe("tsx");
    expect(resolveLanguage(null, "pyproject.toml")).toBe("toml");
    expect(resolveLanguage("elixir", "lib/charge.ex")).toBeNull();
    expect(resolveLanguage(undefined, "Makefile")).toBeNull();
    expect(extensionOf("lib/checkout/charge.ex")).toBe(".ex");
    expect(extensionOf(".bashrc")).toBeNull();
  });

  it("normalises line endings and a trailing newline the same way for plain and highlighted", () => {
    expect(normaliseCode("a\r\nb\n")).toBe("a\nb");
    expect(plainLines("a\n\nb\n")).toEqual([[{ text: "a", role: "plain" }], [], [{ text: "b", role: "plain" }]]);
  });
});
