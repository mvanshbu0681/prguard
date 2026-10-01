import { createHash } from "node:crypto";
import { z } from "zod";
import { commentableLines, newLineText, type FileDiff } from "./diff.ts";
import { SEVERITY_RANK, type Finding, type Severity } from "./types.ts";

export const rawFindingSchema = z.object({
  path: z.string(),
  line: z.number().nullish(),
  end_line: z.number().nullish(),
  severity: z.string(),
  category: z.string().nullish(),
  title: z.string(),
  body: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number().nullish(),
  details: z.object({ title: z.string(), body: z.string() }).nullish(),
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

const DIFF_PREFIX = /^[+\- ]?\s*\d+\s\|\s?/;

/**
 * Models sometimes copy the diff's `+    82 | ` prefix into code. When every line carries it, it is
 * removed; committing it would break the file.
 */
export function stripDiffPrefix(code: string): string {
  const lines = code.split("\n");
  const filled = lines.filter((l) => l.trim());
  if (filled.length === 0 || !filled.every((l) => DIFF_PREFIX.test(l))) return code;
  return lines.map((l) => l.replace(DIFF_PREFIX, "")).join("\n");
}

/**
 * Validates a model finding against the PR diff. The line must be commentable (inside a hunk): an
 * exact hit keeps a multi-line range and suggestion; a near miss snaps to the closest diff line in
 * the same hunk and drops the suggestion; anything else is kept for the review body.
 */
export function anchor(raw: RawFinding, files: Map<string, FileDiff>): Finding | null {
  let title = raw.title.trim().replace(/\.$/, "");
  // A Test gap finding names the missing test, so it never reads like the bug another reviewer posts.
  if (raw.reviewer === "tests" && title && !/^no tests? /i.test(title)) title = `No test covers ${title[0]!.toLowerCase()}${title.slice(1)}`;
  const body = raw.body.trim();
  if (!title || !body) return null;

  const severity = SEVERITY_ALIASES[raw.severity.trim().toLowerCase()] ?? "medium";
  const confidence = Math.min(1, Math.max(0, raw.confidence ?? 0.7));
  const category = (raw.category ?? "bug").trim().toLowerCase().split(/\s+/)[0] || "bug";
  const file = resolvePath(raw.path, files);
  const path = file?.path ?? raw.path.trim().replace(/^\.?\//, "");
  const details = raw.details?.title.trim() && raw.details.body.trim() ? { title: raw.details.title.trim(), body: raw.details.body.trim() } : null;
  const base = { reviewer: raw.reviewer, path, severity, category, title, body, confidence, fingerprint: fingerprint(path, title), details };

  // A file outside this diff (seen through the repo tools) cannot carry a line comment.
  if (!file || raw.line == null) return { ...base, line: null, startLine: null, suggestion: null, placement: "body" };

  const lines = commentableLines(file);
  const line = Math.round(raw.line);
  const end = raw.end_line ? Math.round(raw.end_line) : null;
  const suggestion = raw.suggestion && raw.suggestion.trim() ? stripDiffPrefix(raw.suggestion.replace(/\r/g, "")) : null;

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
 * Models often cite one line but write a suggestion that rewrites the lines after it too. If lines
 * that follow the range reappear in the suggestion, the range is widened to cover them, so that
 * committing the suggestion does not leave them duplicated; when the range cannot be widened within
 * the diff, the suggestion is dropped (the comment stays). A suggestion equal to the code is dropped.
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
  const current = [];
  for (let l = start; l <= last; l++) current.push(text.get(l) ?? "");
  const sug = reindent(suggestion.replace(/\n$/, "").split("\n"), current[0] ?? "");
  const fitted = sug.join("\n");
  if (fitted.trim() === current.join("\n").trim()) return { suggestion: null, last };

  // Fewer lines than the range: only a pure deletion (the kept lines, in order) is safe to commit.
  if (sug.length < current.length) {
    let i = 0;
    for (const line of current) if (i < sug.length && line.trim() === sug[i]!.trim()) i++;
    return { suggestion: i === sug.length ? fitted : null, last };
  }

  const extra = sug.length - current.length;
  if (extra === 0) return { suggestion: fitted, last };
  const meaningful = (s: string) => s.trim().length >= 6 && /[A-Za-z0-9_]{3}/.test(s);
  const inSuggestion = new Set(sug.map((s) => s.trim()).filter(meaningful));
  let widenTo = last;
  for (let k = 1; k <= Math.min(extra, 12); k++) {
    const fileLine = text.get(last + k);
    if (fileLine === undefined) {
      if (widenTo === last) break;
      return { suggestion: null, last };
    }
    if (inSuggestion.has(fileLine.trim())) widenTo = last + k;
  }
  if (widenTo === last) return { suggestion: fitted, last };
  for (let l = last + 1; l <= widenTo; l++) if (lines.get(l) !== hunk) return { suggestion: null, last };
  return { suggestion: fitted, last: widenTo };
}

/**
 * A replacement for exactly lines `start..last` of a file in the PR diff, fitted like review
 * suggestions (indentation, no-op check), or null when it cannot be committed safely there. The range
 * never widens: a reply's suggestion applies to its thread's lines.
 */
export function fitReplacement(file: FileDiff, start: number, last: number, code: string): string | null {
  const lines = commentableLines(file);
  const hunk = lines.get(last);
  if (hunk === undefined) return null;
  for (let l = start; l <= last; l++) if (lines.get(l) !== hunk) return null;
  const fitted = fitSuggestion(file, lines, hunk, start, last, stripDiffPrefix(code.replace(/\r/g, "")));
  return fitted.last === last ? fitted.suggestion : null;
}

/** Models often drop leading indentation; restore it from the first line being replaced. */
function reindent(sug: string[], firstLine: string): string[] {
  const target = /^\s*/.exec(firstLine)![0];
  const firstCode = sug.find((s) => s.trim());
  if (!target || firstCode === undefined) return sug;
  const have = /^\s*/.exec(firstCode)![0];
  if (have.length >= target.length || !target.startsWith(have)) return sug;
  const pad = target.slice(have.length);
  return sug.map((s) => (s.trim() ? pad + s : s));
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

function distance(a: Pick<Finding, "line" | "startLine">, b: Pick<Finding, "line" | "startLine">): number {
  if (a.line === null || b.line === null) return 0;
  return Math.abs((a.startLine ?? a.line) - (b.startLine ?? b.line));
}

/** Title words too common to say two findings are about the same thing. */
const GENERIC_WORDS = new Set([
  "missing", "check", "checks", "error", "errors", "value", "values", "invalid", "unused", "before", "after",
  "should", "using", "instead", "without", "could", "never", "always", "handling", "handle", "possible", "potential",
]);

/** Plural and singular count as one word when comparing titles (`amounts`, `amount`). */
export function stem(words: string[]): string[] {
  return words.map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function overlaps(a: Finding, b: Finding): boolean {
  if (a.line === null || b.line === null) return false;
  return (a.startLine ?? a.line) <= b.line && (b.startLine ?? b.line) <= a.line;
}

/** Lines between two ranges, 0 when they overlap (or either has no line). */
function rangeGap(a: Pick<Finding, "line" | "startLine">, b: Pick<Finding, "line" | "startLine">): number {
  if (a.line === null || b.line === null) return 0;
  return Math.max(0, (a.startLine ?? a.line) - b.line, (b.startLine ?? b.line) - a.line);
}

function fromCheck(f: Pick<Finding, "reviewer">, checkIds?: Set<string>): boolean {
  return Boolean(checkIds?.size) && f.reviewer.split("+").some((id) => checkIds!.has(id));
}

/** Reviewers whose findings are their own kind (a missing test, a stale doc). */
const OWN_KIND = new Set(["tests", "docs"]);

/**
 * The same problem reported twice in one review: the same fingerprint close by, overlapping lines
 * with a similar title, or overlapping lines that name the same subject (reviewers word the same bug
 * differently). A second real occurrence elsewhere in the file is kept.
 */
export function isDuplicate(a: Finding, b: Finding, checkIds?: Set<string>): boolean {
  if (a.path !== b.path) return false;
  // Two check findings are exact (a package, a secret): only the very same one is a duplicate.
  if (fromCheck(a, checkIds) && fromCheck(b, checkIds)) return a.fingerprint === b.fingerprint && a.line === b.line;
  // A missing test or stale doc is its own kind of finding, never the same as the bug beside it.
  const [ka, kb] = [a.reviewer.split("+")[0]!, b.reviewer.split("+")[0]!];
  if ((OWN_KIND.has(ka) || OWN_KIND.has(kb)) && ka !== kb) return false;
  if (a.fingerprint === b.fingerprint && distance(a, b) <= 20) return true;
  const wa = stem(titleWords(a.title));
  const wb = stem(titleWords(b.title));
  // The same issue worded almost the same way is one finding, even when reviewers anchor it apart.
  if (jaccard(wa, wb) >= 0.7) return true;
  if (!near(a, b)) return false;
  // Words from the file's own name (`refund` in `refunds.py`) are in most of its titles: they name no subject.
  const fileWords = new Set(stem(titleWords(a.path.replace(/[/._-]+/g, " "))));
  const shared = wa.filter((w) => wb.includes(w) && !fileWords.has(w));
  if (jaccard(wa, wb) >= 0.34 || shared.length >= 2) return true;
  return overlaps(a, b) && shared.some((w) => w.length >= 5 && !GENERIC_WORDS.has(w));
}

type Previous = Pick<Finding, "path" | "title" | "fingerprint" | "line" | "startLine" | "category"> & {
  snippet?: string | null;
  status?: string;
};
type Lines = Pick<Finding, "line" | "startLine">;

/** Trimmed text of each line in the new diff to its line numbers, to find earlier findings' lines again. */
function lineIndex(file: FileDiff): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const [n, t] of newLineText(file)) {
    const key = t.trim();
    if (key.length < 6) continue;
    const at = index.get(key);
    if (at) at.push(n);
    else index.set(key, [n]);
  }
  return index;
}

/** Where an earlier finding's recorded lines sit now (pushes since may have moved them), nearest first. */
function relocate(p: Previous, index: Map<string, number[]> | undefined): Lines {
  if (!index || !p.snippet || p.line === null) return p;
  const start = p.startLine ?? p.line;
  let best: number | null = null;
  for (const [offset, probe] of p.snippet.split("\n").entries()) {
    for (const n of index.get(probe.trim()) ?? []) {
      if (best === null || Math.abs(n - offset - start) < Math.abs(best - start)) best = n - offset;
    }
  }
  if (best === null) return p;
  return { startLine: p.startLine === null ? null : best, line: best + p.line - start };
}

/**
 * A finding already shown on this PR by an earlier review, at its old lines or where they moved to.
 * One still open or dismissed is the same finding wherever it sits in the file; a fixed one only
 * nearby, since the problem can come back elsewhere. Check findings are exact.
 */
function isRepeat(p: Previous, moved: Lines, f: Finding, check: boolean): boolean {
  if (p.path !== f.path) return false;
  const gap = Math.min(rangeGap(p, f), rangeGap(moved, f));
  if (check) return p.fingerprint === f.fingerprint && gap <= 40;
  const reach = p.status === "fixed" ? 40 : Infinity;
  if (p.fingerprint === f.fingerprint && gap <= reach) return true;
  const wp = stem(titleWords(p.title));
  const wf = stem(titleWords(f.title));
  const sim = jaccard(wp, wf);
  if ((sim >= 0.7 && gap <= reach) || (sim >= 0.6 && gap <= 40)) return true;
  const shared = wp.filter((w) => wf.includes(w)).length;
  return gap <= 4 && (sim >= 0.34 || shared >= 2);
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

export type Processed = { findings: Finding[]; repeats: number; lowConfidence: number; dropped: number; unique: number };

/**
 * Anchors, filters, dedupes, ranks and places findings. `previous` holds findings already shown on
 * this PR; anything matching one of them is dropped so a push never repeats a comment.
 */
export function processFindings(
  raw: RawFinding[],
  files: FileDiff[],
  previous: Previous[] = [],
  focus?: Map<string, Set<number>>,
  checkIds?: Set<string>,
): Processed {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const valid = raw.map((r) => anchor(r, byPath)).filter((f): f is Finding => f !== null);
  // In an incremental review only findings on the new lines count; older code was reviewed before.
  const anchored = focus ? valid.filter((f) => touchesFocus(f, focus)) : valid;
  const dropped = raw.length - anchored.length;

  const confident = anchored.filter((f) => f.confidence >= MIN_CONFIDENCE);
  const lowConfidence = anchored.length - confident.length;

  const kept: Finding[] = [];
  for (const f of rank(confident)) {
    const dup = kept.find((k) => isDuplicate(k, f, checkIds));
    if (dup) {
      const ids = dup.reviewer.split("+");
      // Team rules owns a finding it shares: its badge shows first.
      if (!ids.includes(f.reviewer)) dup.reviewer = (f.reviewer === "rules" ? [f.reviewer, ...ids] : [...ids, f.reviewer]).join("+");
      continue;
    }
    kept.push({ ...f });
  }

  const indexes = new Map<string, Map<string, number[]>>();
  const earlier = previous
    .filter((p) => kept.some((f) => f.path === p.path))
    .map((p) => {
      const file = byPath.get(p.path);
      if (file && !indexes.has(p.path)) indexes.set(p.path, lineIndex(file));
      return { p, moved: relocate(p, indexes.get(p.path)) };
    });
  const fresh = kept.filter((f) => !earlier.some(({ p, moved }) => isRepeat(p, moved, f, fromCheck(f, checkIds))));
  const repeats = kept.length - fresh.length;
  return { findings: fresh, repeats, lowConfidence, dropped, unique: kept.length };
}

/**
 * Caps line comments: at most `MAX_INLINE`, nits at most `MAX_NITS`. Overflow goes to the review
 * body, extra nits are hidden. Runs last, after verification and learnings have removed findings.
 */
export function place(findings: Finding[]): Finding[] {
  let inline = 0;
  let nits = 0;
  return rank(findings).map((original) => {
    const f = { ...original };
    if (f.placement !== "inline") return f;
    if (f.severity === "nit") {
      if (nits >= MAX_NITS || inline >= MAX_INLINE) f.placement = "hidden";
      else {
        nits++;
        inline++;
      }
      return f;
    }
    if (inline >= MAX_INLINE) f.placement = "body";
    else inline++;
    return f;
  });
}
