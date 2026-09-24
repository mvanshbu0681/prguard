// OWNER: t1d (wave 1). The ONLY place a grammar is imported. Ten languages, one module each.
//
// Never the barrel (`shiki`, `shiki/bundle/*`, `@shikijs/langs` — 8.25 MB unpacked,
// design §5.6 / dashboard §4). Each loader is a static-specifier dynamic import, so the
// bundler emits one chunk per grammar and a page only ever fetches the grammar it renders.
// tests/unit/code/shiki.test.ts fails if a specifier outside this list appears anywhere
// under src/components/code/.
import type { LanguageRegistration } from "shiki/core";

export const SUPPORTED_LANGUAGES = [
  "python",
  "typescript",
  "tsx",
  "javascript",
  "json",
  "bash",
  "yaml",
  "toml",
  "markdown",
  "diff",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

type GrammarModule = { default: LanguageRegistration[] };

export const LANGUAGE_LOADERS: Readonly<Record<SupportedLanguage, () => Promise<GrammarModule>>> = {
  python: () => import("@shikijs/langs/python"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  bash: () => import("@shikijs/langs/bash"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  markdown: () => import("@shikijs/langs/markdown"),
  diff: () => import("@shikijs/langs/diff"),
};

/** Printed in the code block header (11px mono caps). */
export const LANGUAGE_LABEL: Readonly<Record<SupportedLanguage, string>> = {
  python: "python",
  typescript: "typescript",
  tsx: "tsx",
  javascript: "javascript",
  json: "json",
  bash: "bash",
  yaml: "yaml",
  toml: "toml",
  markdown: "markdown",
  diff: "diff",
};

const ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  py: "python",
  python3: "python",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  // The javascript grammar is "JavaScript (with React support)": it parses JSX.
  jsx: "javascript",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  patch: "diff",
};

const EXTENSIONS: Readonly<Record<string, SupportedLanguage>> = {
  ".py": "python",
  ".pyi": "python",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".markdown": "markdown",
  ".diff": "diff",
  ".patch": "diff",
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** ".py" for "src/checkout/charge.py"; null when the last path segment has no extension. */
export function extensionOf(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const name = filePath.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : null;
}

/** A language name (or alias), else the file extension, → a bundled language or null. */
export function resolveLanguage(lang?: string | null, filePath?: string | null): SupportedLanguage | null {
  const name = lang?.trim().toLowerCase();
  if (name) {
    if (isSupportedLanguage(name)) return name;
    if (ALIASES[name]) return ALIASES[name];
  }
  const ext = extensionOf(filePath);
  return (ext && EXTENSIONS[ext]) || null;
}
