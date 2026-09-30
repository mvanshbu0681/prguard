import { createHash } from "node:crypto";
import { z } from "zod";
import { commentableLines, newLineText, type FileDiff } from "./diff.ts";
import { SEVERITY_RANK, type Finding, type Severity } from "./types.ts";

export const rawFindingSchema = z.object({
  path: z.string(),
  line: z.number(),
  end_line: z.number().nullish(),
  severity: z.string(),
  category: z.string().nullish(),
  title: z.string(),
  body: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number().nullish(),
});

export const submitSchema = z.object({ findings: z.array(rawFindingSchema) });

export type RawFinding = z.infer<typeof rawFindingSchema> & { reviewer: string };

const SEVERITY_ALIASES: Record<string, Severity> = {
  critical: "critical",
  blocker: "critical",
  high: "high",
  major: "high",
  error: "high",
  medium: "medium",
  moderate: "medium",
  warning: "medium",
  low: "low",
  minor: "low",
  nit: "nit",
  nitpick: "nit",
  info: "nit",
  style: "nit",
};

const STOP = new Set(["a", "an", "the", "in", "on", "of", "to", "for", "is", "and", "or", "with", "when", "not", "be", "may", "can"]);

export function titleWords(title: string): string[] {
  return [...new Set(title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)))];
}

export function fingerprint(path: string, title: string): string {
  return createHash("sha1").update(`${path}|${titleWords(title).sort().join(" ")}`).digest("hex").slice(0, 16);
}

function resolvePath(raw: string, files: Map<string, FileDiff>): FileDiff | undefined {
  const cleaned = raw.trim().replace(/^\.?\//, "").replace(/^[ab]\//, "");
  const exact = files.get(cleaned);
  if (exact) return exact;
  const matches = [...files.values()].filter((f) => f.path.endsWith(`/${cleaned}`));
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Validates a model finding against the PR diff. The line must be commentable (inside a hunk): an
 * exact hit keeps a multi-line range and suggestion; a near miss snaps to the closest diff line in
 * the same hunk and drops the suggestion; anything else is kept for the review body.
 */
export function anchor(raw: RawFinding, files: Map<string, FileDiff>): Finding | null {
  const file = resolvePath(raw.path, files);
  if (!file) return null;
  const title = raw.title.trim().replace(/\.$/, "");
  const body = raw.body.trim();
  if (!title || !body) return null;

  const severity = SEVERITY_ALIASES[raw.severity.trim().toLowerCase()] ?? "medium";
  const confidence = Math.min(1, Math.max(0, raw.confidence ?? 0.7));
  const category = (raw.category ?? "bug").trim().toLowerCase().split(/\s+/)[0] || "bug";
  const base = {
    reviewer: raw.reviewer,
    path: file.path,
    severity,
    category,
    title,
    body,
    confidence,
    fingerprint: fingerprint(file.path, title),
  };

  const lines = commentableLines(file);
  const line = Math.round(raw.line);
  const end = raw.end_line ? Math.round(raw.end_line) : null;
  const suggestion = raw.suggestion && raw.suggestion.trim() ? raw.suggestion.replace(/\r/g, "") : null;

  if (lines.has(line)) {
    const hunk = lines.get(line);
    let startLine: number | null = null;
    let last = line;
    if (end && end > line && end - line < 40) {
      let sameHunk = true;
      for (let l = line; l <= end; l++) if (lines.get(l) !== hunk) sameHunk = false;
      if (sameHunk) {
        startLine = line;
        last = end;
      }
    }
    const rangeKept = !end || end === line || startLine !== null;
    let finalSuggestion = rangeKept ? suggestion : null;
    if (finalSuggestion !== null) {
      const fitted = fitSuggestion(file, lines, hunk!, startLine ?? line, last, finalSuggestion);
      finalSuggestion = fitted.suggestion;
      if (fitted.last !== last) {
        startLine = startLine ?? line;
        last = fitted.last;
      }
    }
    return { ...base, line: last, startLine, suggestion: finalSuggestion, placement: "inline" };
  }

  for (let d = 1; d <= 3; d++) {
    for (const candidate of [line - d, line + d]) {
      if (lines.has(candidate)) return { ...base, line: candidate, startLine: null, suggestion: null, placement: "inline" };
    }
  }
  return { ...base, line: line > 0 ? line : null, startLine: null, suggestion: null, placement: "body" };
}

/**
 * Models often write a suggestion that also repeats the lines right after the range they cited.
 * When the extra trailing lines match the file, the range is widened so applying it is correct.
 * A suggestion identical to the current code is dropped.
 */
function fitSuggestion(
  file: FileDiff,
  lines: Map<number, number>,
  hunk: number,
  start: number,
  last: number,
  suggestion: string,
): { suggestion: string | null; last: number } {
  const text = newLineText(file);
  const sug = suggestion.replace(/\n$/, "").split("\n");
  const current = [];
  for (let l = start; l <= last; l++) current.push(text.get(l) ?? "");
  if (sug.join("\n").trim() === current.join("\n").trim()) return { suggestion: null, last };

  const extra = sug.length - current.length;
  if (extra > 0 && extra <= 5) {
    let matches = true;
    for (let i = 1; i <= extra; i++) {
      const fileLine = text.get(last + i);
      if (fileLine === undefined || lines.get(last + i) !== hunk || fileLine.trim() !== sug[sug.length - extra + i - 1]!.trim()) {
        matches = false;
        break;
      }
    }
    if (matches) return { suggestion, last: last + extra };
  }
  return { suggestion, last };
}

const MIN_CONFIDENCE = 0.5;
const MAX_INLINE = 15;
const MAX_NITS = 3;

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const inter = a.filter((w) => setB.has(w)).length;
  return inter / (a.length + b.length - inter);
}

function near(a: Finding, b: Finding): boolean {
  if (a.path !== b.path) return false;
  if (a.line === null || b.line === null) return true;
  const aStart = a.startLine ?? a.line;
  const bStart = b.startLine ?? b.line;
  return aStart <= b.line + 2 && bStart <= a.line + 2;
}

/** The same problem reported twice: same place and a similar title, or the same fingerprint. */
export function isDuplicate(a: Finding, b: Finding): boolean {
  if (a.fingerprint === b.fingerprint) return true;
  if (!near(a, b)) return false;
  const wa = titleWords(a.title);
  const wb = titleWords(b.title);
  const shared = wa.filter((w) => wb.includes(w)).length;
  return jaccard(wa, wb) >= 0.34 || shared >= 2 || a.category === b.category;
}

type Previous = Pick<Finding, "path" | "title" | "fingerprint" | "line" | "startLine" | "category">;

/** A finding already shown on this PR by an earlier review (lines may have shifted a little). */
function isRepeat(p: Previous, f: Finding): boolean {
  if (p.fingerprint === f.fingerprint) return true;
  if (p.path !== f.path) return false;
  const wp = titleWords(p.title);
  const wf = titleWords(f.title);
  const sim = jaccard(wp, wf);
  if (sim >= 0.6) return true;
  const shared = wp.filter((w) => wf.includes(w)).length;
  const close = p.line === null || f.line === null || Math.abs((p.startLine ?? p.line) - (f.startLine ?? f.line)) <= 4;
  return close && (sim >= 0.34 || shared >= 2 || p.category === f.category);
}

/** In an incremental review, a finding must touch a line the new commits added. */
function touchesFocus(f: Finding, focus: Map<string, Set<number>>): boolean {
  const lines = focus.get(f.path);
  if (!lines || f.line === null) return false;
  for (let l = (f.startLine ?? f.line) - 2; l <= f.line + 2; l++) if (lines.has(l)) return true;
  return false;
}

export function rank(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.confidence - a.confidence || a.path.localeCompare(b.path),
  );
}

export type Processed = { findings: Finding[]; repeats: number; lowConfidence: number };

/**
 * Anchors, filters, dedupes, ranks and places findings. `previous` holds findings already shown on
 * this PR; anything matching one of them is dropped so a push never repeats a comment.
 */
export function processFindings(
  raw: RawFinding[],
  files: FileDiff[],
  previous: Previous[] = [],
  focus?: Map<string, Set<number>>,
): Processed {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const anchored = raw
    .map((r) => anchor(r, byPath))
    .filter((f): f is Finding => f !== null)
    .filter((f) => !focus || touchesFocus(f, focus));

  const confident = anchored.filter((f) => f.confidence >= MIN_CONFIDENCE);
  const lowConfidence = anchored.length - confident.length;

  const kept: Finding[] = [];
  for (const f of rank(confident)) {
    const dup = kept.find((k) => isDuplicate(k, f));
    if (dup) {
      if (!dup.reviewer.split("+").includes(f.reviewer)) dup.reviewer = `${dup.reviewer}+${f.reviewer}`;
      continue;
    }
    kept.push({ ...f });
  }

  const fresh = kept.filter((f) => !previous.some((p) => isRepeat(p, f)));
  const repeats = kept.length - fresh.length;

  let inline = 0;
  let nits = 0;
  for (const f of fresh) {
    if (f.placement !== "inline") continue;
    if (f.severity === "nit") {
      if (nits >= MAX_NITS || inline >= MAX_INLINE) f.placement = "hidden";
      else {
        nits++;
        inline++;
      }
      continue;
    }
    if (inline >= MAX_INLINE) f.placement = "body";
    else inline++;
  }
  return { findings: fresh, repeats, lowConfidence };
}
