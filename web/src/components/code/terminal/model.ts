// OWNER: t1d (wave 1). Captured text → terminal lines. Pure: no React, no DOM.
//
// Pipeline: CRLF → LF · ANSI → classed spans (ansi.ts) · split at \n · resolve \r and \b
// the way a terminal would (last write wins per column) · detect "$ " prompt lines ·
// apply the caller's highlight rules · number the lines.
//
// Highlight rules are the caller's, in order, so the Proof Bench decides what reads as
// signal and what reads as alarm. Precedence for a character's colour:
//   match-scope rule tone  >  line-scope rule tone  >  ANSI class  >  prompt/command role  >  body.
// Rules beat ANSI on purpose: pytest paints "passed" green, and there is no green here.
import { parseAnsi, sameClasses, type AnsiSpan } from "./ansi";
import type { TextTone } from "../shared/types";

export interface TerminalHighlightRule {
  /** A RegExp (its flags are kept; `g`/`y` are managed here) or a literal substring. */
  pattern: RegExp | string;
  /** Text tone for the match (scope "match") or the whole line (scope "line"). Omit for a pure mark. */
  tone?: TextTone;
  /** "match" (default) colours the matched text only; "line" colours every character of the line. */
  scope?: "match" | "line";
  /** Emitted as data-mark on the line and, for "match" rules, on the matched span, so a parent
   *  can target it (the bench's 1px underline under `1 failed`). Whitespace-free. */
  mark?: string;
}

export type TerminalRole = "prompt" | "command";

export interface TerminalSegment {
  text: string;
  /** prg-ansi-* classes from the capture. */
  classes: string[];
  role?: TerminalRole;
  /** Final text tone after rule precedence (see the header). */
  tone?: TextTone;
  /** Mark of the match-scope rule that claimed this text. */
  mark?: string;
}

export interface TerminalLine {
  /** Printed line number: startLine + index. */
  number: number;
  kind: "prompt" | "output";
  /** Plain text of the line (what a copy yields). */
  text: string;
  /** Tone of the first matching line-scope rule. */
  tone?: TextTone;
  /** Every mark of every rule that matched this line, in rule order, deduplicated. */
  marks: string[];
  segments: TerminalSegment[];
}

export interface TerminalBuildOptions {
  highlight?: readonly TerminalHighlightRule[];
  /** Prompt prefix that marks a command line. Default "$ ". `false` disables detection. */
  prompt?: string | false;
  /** Number printed on the first line. Default 1. */
  startLine?: number;
}

export const DEFAULT_PROMPT = "$ ";

// ---------------------------------------------------------------- line splitting

function splitLines(spans: readonly AnsiSpan[]): AnsiSpan[][] {
  const lines: AnsiSpan[][] = [[]];
  for (const span of spans) {
    const parts = span.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, classes: span.classes });
    });
  }
  return lines;
}

/** Resolve \r (back to column 0) and \b (one column left) with overwrite semantics:
 *  "10%\r100%" → "100%". Lines without either are returned untouched. */
export function composeLine(spans: readonly AnsiSpan[]): AnsiSpan[] {
  if (!spans.some((s) => s.text.includes("\r") || s.text.includes("\b"))) return [...spans];
  const cells: { ch: string; classes: string[] }[] = [];
  let cursor = 0;
  for (const span of spans) {
    for (const ch of span.text) {
      if (ch === "\r") cursor = 0;
      else if (ch === "\b") cursor = Math.max(0, cursor - 1);
      else {
        // A gap (cursor moved past the end) is filled with spaces, as a terminal shows it.
        while (cells.length < cursor) cells.push({ ch: " ", classes: [] });
        cells[cursor] = { ch, classes: span.classes };
        cursor += 1;
      }
    }
  }
  const out: AnsiSpan[] = [];
  for (const cell of cells) {
    const prev = out[out.length - 1];
    if (prev && sameClasses(prev.classes, cell.classes)) prev.text += cell.ch;
    else out.push({ text: cell.ch, classes: cell.classes });
  }
  return out;
}

// ---------------------------------------------------------------- rules

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toRegExp(pattern: RegExp | string, global: boolean): RegExp {
  if (typeof pattern === "string") return new RegExp(escapeRegExp(pattern), global ? "g" : "");
  const flags = pattern.flags.replace(/[gy]/g, "");
  return new RegExp(pattern.source, global ? `${flags}g` : flags);
}

interface Claim {
  start: number;
  end: number;
  /** Index of the rule that claimed this text. */
  rule: number;
  tone?: TextTone;
  mark?: string;
}

/** Match-scope claims over `text`. Earlier rules win any overlap; zero-length matches claim nothing. */
function claimMatches(text: string, rules: readonly TerminalHighlightRule[]): Claim[] {
  const claimed = new Uint8Array(text.length);
  const claims: Claim[] = [];
  for (const [index, rule] of rules.entries()) {
    if ((rule.scope ?? "match") !== "match") continue;
    const re = toRegExp(rule.pattern, true);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      let free = true;
      for (let i = start; i < end; i++) {
        if (claimed[i]) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      claimed.fill(1, start, end);
      claims.push({ start, end, rule: index, tone: rule.tone, mark: rule.mark });
    }
  }
  return claims.sort((a, b) => a.start - b.start);
}

/** Cut segments at every claim boundary and give each piece its final tone and mark. */
function applyClaims(segments: readonly TerminalSegment[], claims: readonly Claim[], lineTone: TextTone | undefined): TerminalSegment[] {
  const cuts = new Set<number>();
  for (const c of claims) {
    cuts.add(c.start);
    cuts.add(c.end);
  }
  const out: TerminalSegment[] = [];
  let offset = 0;
  for (const seg of segments) {
    const segStart = offset;
    const segEnd = offset + seg.text.length;
    offset = segEnd;
    const points = [segStart, ...[...cuts].filter((p) => p > segStart && p < segEnd).sort((a, b) => a - b), segEnd];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      if (to <= from) continue;
      const claim = claims.find((c) => c.start <= from && from < c.end);
      const tone = claim?.tone ?? lineTone;
      const piece: TerminalSegment = { text: seg.text.slice(from - segStart, to - segStart), classes: seg.classes };
      if (seg.role) piece.role = seg.role;
      if (tone) piece.tone = tone;
      if (claim?.mark) piece.mark = claim.mark;
      out.push(piece);
    }
  }
  return out;
}

// ---------------------------------------------------------------- build

/** Split the prompt prefix off a command line: "$ " → role prompt, the rest → role command. */
function splitPrompt(spans: readonly AnsiSpan[], promptLength: number): TerminalSegment[] {
  const out: TerminalSegment[] = [];
  let remaining = promptLength;
  for (const s of spans) {
    if (remaining > 0) {
      const head = s.text.slice(0, remaining);
      const tail = s.text.slice(remaining);
      remaining -= head.length;
      if (head) out.push({ text: head, classes: s.classes, role: "prompt" });
      if (tail) out.push({ text: tail, classes: s.classes, role: "command" });
    } else {
      out.push({ text: s.text, classes: s.classes, role: "command" });
    }
  }
  return out;
}

export function buildTerminalLines(text: string, options: TerminalBuildOptions = {}): TerminalLine[] {
  const { highlight = [], prompt = DEFAULT_PROMPT, startLine = 1 } = options;
  const spans = parseAnsi(text.replace(/\r\n/g, "\n"));
  const raw = splitLines(spans);
  // A capture that ends with a newline does not own an empty last line. Judged on the parsed
  // text, so a trailing SGR reset after the newline (pytest --color=yes) changes nothing.
  if (raw.length > 1 && raw[raw.length - 1].length === 0 && spans[spans.length - 1]?.text.endsWith("\n")) raw.pop();

  return raw.map((spans, index) => {
    const composed = composeLine(spans);
    const lineText = composed.map((s) => s.text).join("");
    const isPrompt = typeof prompt === "string" && prompt.length > 0 && lineText.startsWith(prompt);
    const segments: TerminalSegment[] = isPrompt
      ? splitPrompt(composed, prompt.length)
      : composed.map((s) => ({ text: s.text, classes: s.classes }));

    const claims = claimMatches(lineText, highlight);
    let tone: TextTone | undefined;
    const marks: string[] = [];
    highlight.forEach((rule, i) => {
      const lineScope = (rule.scope ?? "match") === "line";
      const hit = lineScope ? toRegExp(rule.pattern, false).test(lineText) : claims.some((c) => c.rule === i);
      if (!hit) return;
      if (lineScope && tone === undefined && rule.tone) tone = rule.tone;
      if (rule.mark && !marks.includes(rule.mark)) marks.push(rule.mark);
    });

    const line: TerminalLine = {
      number: startLine + index,
      kind: isPrompt ? "prompt" : "output",
      text: lineText,
      marks,
      segments: applyClaims(segments, claims, tone),
    };
    if (tone) line.tone = tone;
    return line;
  });
}

/** Contiguous, near-equal groups (the bench ignites terminal rows as three stepped groups,
 *  motion spec §2.3 — never one delay per row). */
export function splitIntoGroups<T>(items: readonly T[], groups: number): T[][] {
  const n = items.length;
  const g = Math.max(1, Math.min(Math.floor(groups) || 1, Math.max(n, 1)));
  const out: T[][] = Array.from({ length: g }, () => []);
  items.forEach((item, i) => out[Math.floor((i * g) / n)].push(item));
  return out;
}
