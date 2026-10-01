import type { FileDiff } from "./diff.ts";

/** Text that is already code or markup: fences, code spans, links, HTML tags, URLs. */
const PROTECTED = /```[\s\S]*?```|`[^`]+`|\[[^\]\n]*\]\([^)\n]*\)|<[^>\n]+>|https?:\/\/\S+/g;
const TOKEN = /\.?[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*(?:\(\))?/g;

const SNAKE = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/;
const CAMEL = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const PASCAL_MULTI = /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/;
const DOTTED = /^[A-Za-z_]\w+(?:\.[A-Za-z_]\w*)+$/;

/** Shapes only code has: `snake_case`, `camelCase`, `a.b`, `call()`, `.dotfile`. Plain words never qualify. */
function looksLikeCode(token: string): boolean {
  const bare = token.replace(/\(\)$/, "");
  if (bare.startsWith(".")) return bare.length >= 4;
  if (token.endsWith("()") && bare.length >= 2) return true;
  return SNAKE.test(bare) || CAMEL.test(bare) || DOTTED.test(bare);
}

/** Identifiers and paths from a diff that deserve backticks even without a code shape (e.g. `RefundCreate`). */
export function codeTerms(files: FileDiff[]): Set<string> {
  const terms = new Set<string>();
  for (const file of files) {
    terms.add(file.path);
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "del") continue;
        for (const m of line.text.matchAll(TOKEN)) {
          const token = m[0].replace(/\(\)$/, "");
          if (token.length >= 4 && (PASCAL_MULTI.test(token) || looksLikeCode(token))) terms.add(token);
        }
      }
    }
  }
  return terms;
}

function mapUnprotected(text: string, fn: (plain: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    out += fn(text.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + fn(text.slice(last));
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps code in backticks: changed file paths, identifiers from the diff, and any token shaped like
 * code. Leaves existing code spans, fences, links and HTML alone.
 */
export function codify(text: string, terms: Set<string>): string {
  if (!text) return text;
  const paths = [...terms].filter((t) => t.includes("/")).sort((a, b) => b.length - a.length);
  let result = text;
  if (paths.length) {
    const re = new RegExp(`(?<![\\w/.\`-])(${paths.map(escape).join("|")})(?![\\w/\`-])`, "g");
    result = mapUnprotected(result, (plain) => plain.replace(re, "`$1`"));
  }
  return mapUnprotected(result, (plain) =>
    plain.replace(TOKEN, (token, offset: number, whole: string) => {
      const before = whole[offset - 1] ?? "";
      if (/[\w@`/\-$)\]]/.test(before)) return token;
      const bare = token.replace(/\(\)$/, "");
      return terms.has(bare) || looksLikeCode(token) ? `\`${token}\`` : token;
    }),
  );
}
