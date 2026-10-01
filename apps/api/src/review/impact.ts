import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { ImpactSymbol } from "../db/schema.ts";
import type { FileDiff } from "./diff.ts";

const MAX_SYMBOLS = 15;
const MAX_FILES = 6000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SAMPLES = 5;
const COUNT_ONLY_ABOVE = 200;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor", "coverage", "__pycache__", ".venv", "target"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt)$/i;

/** Names too generic to trace: every codebase has hundreds of them. */
const COMMON = new Set(
  "get set run init main handler handle data value item items index test setup update create delete remove render start stop process call apply load save open close read write parse format build make next done error result response request config options props state self this __init__ constructor tostring equals hashcode string object list map".split(
    " ",
  ),
);

type Lang = "js" | "py" | "go" | "java";

function langOf(path: string): Lang | null {
  const ext = extname(path).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "js";
  if (ext === ".py") return "py";
  if (ext === ".go") return "go";
  if ([".java", ".kt"].includes(ext)) return "java";
  return null;
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "new", "else", "do", "try", "synchronized", "function"]);

const PATTERNS: Record<Lang, RegExp[]> = {
  js: [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>)/,
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
    /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*$/,
  ],
  py: [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/],
  go: [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[([]/, /^type\s+([A-Za-z_]\w*)\s/],
  java: [
    /^\s*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/,
    /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|default)\s+)*[\w<>[\],.? ]+\s+([a-zA-Z_]\w*)\s*\([^;]*$/,
  ],
};

type Definition = { name: string; line: number; indent: number };

function definitionsIn(lines: string[], lang: Lang): Definition[] {
  const out: Definition[] = [];
  lines.forEach((text, i) => {
    for (const re of PATTERNS[lang]) {
      const name = re.exec(text)?.[1];
      if (name && !KEYWORDS.has(name)) {
        out.push({ name, line: i + 1, indent: /^\s*/.exec(text)![0].length });
        break;
      }
    }
  });
  return out;
}

function traceable(name: string): boolean {
  return name.length >= 4 && !COMMON.has(name.toLowerCase());
}

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(join(dir, e.name));
    } else if (e.isFile() && CODE.test(e.name)) {
      yield join(dir, e.name);
    }
  }
}

/**
 * Symbols defined in or around the changed lines, found with per-language patterns in the head
 * snapshot, and every place in the repository that references them by name.
 */
export function impact(files: FileDiff[], snapshot: string): ImpactSymbol[] {
  const found = new Map<string, { name: string; path: string; line: number; onChangedLine: boolean }>();
  for (const file of files) {
    const lang = langOf(file.path);
    if (!lang) continue;
    let lines: string[];
    try {
      lines = readFileSync(join(snapshot, file.path), "utf8").split("\n");
    } catch {
      continue;
    }
    const defs = definitionsIn(lines, lang);
    const changed = new Set(file.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "add" && l.newNo !== null).map((l) => l.newNo!)));
    for (const lineNo of changed) {
      const own = defs.find((d) => d.line === lineNo);
      const indent = /^\s*/.exec(lines[lineNo - 1] ?? "")![0].length;
      // The nearest definition above that encloses the line (smaller indent), or the line's own.
      const enclosing = own ?? [...defs].reverse().find((d) => d.line < lineNo && d.indent < Math.max(indent, 1));
      if (!enclosing || !traceable(enclosing.name)) continue;
      const prev = found.get(enclosing.name);
      if (!prev) found.set(enclosing.name, { name: enclosing.name, path: file.path, line: enclosing.line, onChangedLine: Boolean(own) });
      else if (own) prev.onChangedLine = true;
    }
  }
  const symbols = [...found.values()].sort((a, b) => Number(b.onChangedLine) - Number(a.onChangedLine)).slice(0, MAX_SYMBOLS);
  if (symbols.length === 0) return [];

  const escaped = symbols.map((s) => s.name.replace(/\$/g, "\\$"));
  const re = new RegExp(`(?<![\\w$])(${escaped.join("|")})(?![\\w$])`, "g");
  const stats = new Map(symbols.map((s) => [s.name, { refs: 0, files: new Set<string>(), samples: [] as ImpactSymbol["samples"] }]));
  let scanned = 0;
  for (const full of walk(snapshot)) {
    if (++scanned > MAX_FILES) break;
    let text: string;
    try {
      if (statSync(full).size > MAX_FILE_BYTES) continue;
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const path = relative(snapshot, full).replace(/\\/g, "/");
    text.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const sym = symbols.find((s) => s.name === m[1])!;
        if (sym.path === path && sym.line === i + 1) continue;
        const st = stats.get(sym.name)!;
        st.refs++;
        st.files.add(path);
        if (st.refs <= COUNT_ONLY_ABOVE && st.samples.length < MAX_SAMPLES && path !== sym.path) {
          st.samples.push({ path, line: i + 1, text: line.trim().slice(0, 160) });
        }
      }
    });
  }

  return symbols.map((s) => {
    const st = stats.get(s.name)!;
    return {
      name: s.name,
      path: s.path,
      line: s.line,
      refs: st.refs,
      files: st.files.size,
      filePaths: [...st.files].slice(0, 50),
      samples: st.refs > COUNT_ONLY_ABOVE ? [] : st.samples,
    };
  });
}

/** Symbols referenced from files this pull request does not touch: the callers a change can break. */
export function outsideCallers(symbols: ImpactSymbol[], prPaths: Set<string>): ImpactSymbol[] {
  return symbols.filter((s) => s.filePaths.some((p) => !prPaths.has(p)));
}

/** The prompt section: each symbol, where it is defined and a few places that use it. */
export function renderImpact(symbols: ImpactSymbol[]): string {
  const used = symbols.filter((s) => s.refs > 0);
  if (used.length === 0) return "";
  const lines = ["## Impact (code elsewhere that uses what this change touches)"];
  for (const s of used) {
    lines.push(`- \`${s.name}\` defined at \`${s.path}:${s.line}\`: ${s.refs} reference${s.refs === 1 ? "" : "s"} in ${s.files} file${s.files === 1 ? "" : "s"}`);
    for (const sample of s.samples) lines.push(`  - \`${sample.path}:${sample.line}\`: ${sample.text}`);
  }
  return lines.join("\n");
}
