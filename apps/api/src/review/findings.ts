import { createHash } from "node:crypto";
import { z } from "zod";
import { commentableLines, type FileDiff } from "./diff.ts";
import type { Finding, Severity } from "./types.ts";

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
    return { ...base, line: last, startLine, suggestion: rangeKept ? suggestion : null, placement: "inline" };
  }

  for (let d = 1; d <= 3; d++) {
    for (const candidate of [line - d, line + d]) {
      if (lines.has(candidate)) return { ...base, line: candidate, startLine: null, suggestion: null, placement: "inline" };
    }
  }
  return { ...base, line: line > 0 ? line : null, startLine: null, suggestion: null, placement: "body" };
}

export function processFindings(raw: RawFinding[], files: FileDiff[]): Finding[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return raw.map((r) => anchor(r, byPath)).filter((f): f is Finding => f !== null);
}
