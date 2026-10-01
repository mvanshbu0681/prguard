import { z } from "zod";
import { agent } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError } from "../queue/worker.ts";
import { newLineText, renderFile, type FileDiff } from "./diff.ts";
import { runPool } from "./engine.ts";
import { readFile, repoTools } from "./tools.ts";
import type { Finding } from "./types.ts";

const WINDOW = 30;
const PER_CALL = 5;
const STEPS = 3;
const MAX_FILE_CODE = 12_000;
const VERIFIED_SEVERITIES = new Set(["critical", "high", "medium"]);
/** The line-number gutter of code shown to the verifier ("    42 | ", or "+    42 | " in a diff). */
const GUTTER = /^[+-]?[ \t]*\d*[ \t]\| ?/;

const verdictSchema = z.object({
  // A verdict without evidence is allowed (the model sometimes sends null); it leaves the finding unverified.
  verdicts: z.array(z.object({ index: z.number(), verdict: z.string(), evidence: z.string().nullish() })),
});

const SYSTEM = `You verify findings from PR Guard's code reviewers before they are posted on a pull request.
For each numbered finding, check it against the code shown and, when needed, the rest of the repository (read_file, search_code).
- "confirmed": the code shows the problem is real. evidence: one or two sentences that quote the code that proves it in backticks, exactly as written, and cite it as \`path:line\`.
- "rejected": only when the code shows the finding is wrong, for example the case is handled, the value cannot be null, or the check exists elsewhere. evidence: the code that shows it, quoted in backticks and cited as \`path:line\`.
- "unsure": anything else. Unsure findings are still posted.
Never reject a finding for being minor, or because the fix is hard. Answer by calling submit_verdicts once with one verdict per finding.`;

export type Rejected = { finding: Finding; reason: string };

export type Verification = {
  findings: Finding[];
  rejected: Rejected[];
  checked: number;
  confirmed: number;
  /** Findings whose verification call failed or gave no answer; they are posted unverified. */
  failed: number;
  skipped: boolean;
};

function window(file: FileDiff | undefined, snapshot: string | null, path: string, line: number): string {
  const start = Math.max(1, line - WINDOW);
  const end = line + WINDOW;
  if (snapshot) return readFile(snapshot, path, start, end);
  if (!file) return `${path}: not available`;
  const text = newLineText(file);
  const out: string[] = [];
  for (let l = start; l <= end; l++) if (text.has(l)) out.push(`${String(l).padStart(6)} | ${text.get(l)}`);
  return `${path} (changed lines only)\n${out.join("\n")}`;
}

/** The code a finding is checked against: lines around it, or the file's changes for a file-level finding. */
function codeFor(file: FileDiff | undefined, snapshot: string | null, f: Finding): string {
  if (f.line !== null) return window(file, snapshot, f.path, f.line);
  if (file?.hunks.length) {
    const diff = renderFile(file);
    return diff.length > MAX_FILE_CODE ? `${diff.slice(0, MAX_FILE_CODE)}\n…(diff truncated)` : diff;
  }
  return snapshot ? readFile(snapshot, f.path) : `${f.path}: not available`;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Whether a cited line exists and has code on it, in the snapshot or else the diff's new side. */
function lineExists(path: string, line: number, files: Map<string, FileDiff>, snapshot: string | null): boolean {
  if (snapshot) return new RegExp(`^[ \\t]*${line} \\| .*\\S`, "m").test(readFile(snapshot, path, line, line));
  const file = files.get(path);
  return !!file && !!newLineText(file).get(line)?.trim();
}

/**
 * Evidence counts only when it is grounded in the code: it quotes code that was shown (a code span of
 * 3+ characters), or cites a `path:line` that exists. A bare or made-up reference proves nothing.
 */
function grounded(evidence: string, f: Finding, code: string, files: Map<string, FileDiff>, snapshot: string | null): boolean {
  // Only the code itself, without line numbers or file headers, so a quoted path is not a quote.
  const shown = squash(
    code
      .split("\n")
      .flatMap((l) => {
        const gutter = GUTTER.exec(l);
        return gutter ? [l.slice(gutter[0].length)] : [];
      })
      .join("\n"),
  );
  for (const m of evidence.matchAll(/`([^`]+)`/g)) {
    const quote = squash(m[1]!);
    if (quote.length >= 3 && shown.includes(quote)) return true;
  }
  for (const m of evidence.matchAll(/([\w@./-]+):(\d+)/g)) {
    const path = m[1] === f.path || f.path.endsWith(`/${m[1]}`) ? f.path : m[1]!;
    if (lineExists(path, Number(m[2]), files, snapshot)) return true;
  }
  return false;
}

/** Code without line numbers or file headers, squashed. */
function codeOnly(code: string, keep: (line: number | null) => boolean = () => true): string {
  return squash(
    code
      .split("\n")
      .flatMap((l) => {
        const gutter = GUTTER.exec(l);
        if (!gutter) return [];
        const n = Number.parseInt(gutter[0].replace(/[^\d]/g, ""), 10);
        return keep(Number.isNaN(n) ? null : n) ? [l.slice(gutter[0].length)] : [];
      })
      .join("\n"),
  );
}

/** A `path`, `path:line` or `path:line-line` in backticks is a citation, not a code quote. */
const CITATION = /^[\w@./-]+\.\w+(?::\d+(?:-\d+)?)?$/;

/** Every code quote in a piece of evidence: inline spans and each line of a fenced block. */
function quotesIn(evidence: string): string[] {
  const quotes: string[] = [];
  for (const m of evidence.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    for (const line of m[1]!.split("\n")) quotes.push(squash(line.replace(GUTTER, "")));
  }
  for (const m of evidence.replace(/```[\s\S]*?```/g, " ").matchAll(/`([^`]+)`/g)) quotes.push(squash(m[1]!));
  return quotes.filter((q) => q.length >= 3 && !/^[.…]+$/.test(q) && !CITATION.test(q));
}

/**
 * Dropping a finding needs more than confirming one: every code quote must be real (in the code shown
 * or at a `path:line` it cites), every citation must exist, and the counter-evidence must come from
 * somewhere other than the flagged lines (a quote from elsewhere, or a cited line elsewhere holding a
 * quote). Quoting the flagged code back, or inventing code, proves nothing.
 */
export function rejectionGrounded(evidence: string, f: Finding, code: string, files: Map<string, FileDiff>, snapshot: string | null): boolean {
  const quotes = quotesIn(evidence);
  if (!quotes.length) return false;
  const from = f.startLine ?? f.line;
  const cited: { text: string; elsewhere: boolean }[] = [];
  for (const m of evidence.matchAll(/([\w@./-]+\.\w+):(\d+)(?:-(\d+))?/g)) {
    const path = m[1] === f.path || f.path.endsWith(`/${m[1]}`) ? f.path : m[1]!;
    const line = Number(m[2]);
    const last = m[3] ? Number(m[3]) : line;
    if (!lineExists(path, line, files, snapshot)) return false;
    const file = files.get(path);
    const text = codeOnly(snapshot ? readFile(snapshot, path, line - 3, last + 3) : file ? window(file, null, path, line) : "");
    const elsewhere = path !== f.path || f.line === null || last < from! || line > f.line;
    cited.push({ text, elsewhere });
  }
  const shown = codeOnly(code);
  const flagged = f.line === null ? "" : codeOnly(code, (n) => n !== null && n >= from! && n <= f.line!);
  const real = (q: string) => shown.includes(q) || cited.some((c) => c.text.includes(q));
  if (!quotes.every(real)) return false;
  const quotedElsewhere = quotes.some((q) => !(flagged && flagged.includes(q)));
  const citedElsewhere = cited.some((c) => c.elsewhere && quotes.some((q) => c.text.includes(q)));
  return quotedElsewhere || citedElsewhere;
}

/**
 * A rejection must explain itself: a sentence (8+ words) besides the code it quotes. Anything thinner,
 * such as the flagged code quoted back alone, is treated as unsure, so a real bug is never dropped.
 */
function explains(evidence: string): boolean {
  const prose = evidence.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  return prose.trim().split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length >= 8;
}

/**
 * Re-checks model findings of medium severity and above against the code, a few per call, grouped by
 * file. Rejected findings are dropped; confirmed ones carry their evidence; everything else is kept
 * unverified. Skipped when the budget left cannot cover it.
 */
export async function verifyFindings(opts: {
  findings: Finding[];
  files: FileDiff[];
  snapshot: string | null;
  context: string;
  budgetLeft: () => number;
  meta: { reviewId: number; repositoryId: number; signal?: AbortSignal };
}): Promise<Verification> {
  // File-level findings are checked too, against the file's changes.
  const candidates = opts.findings.filter((f) => !f.fromCheck && f.placement !== "hidden" && VERIFIED_SEVERITIES.has(f.severity));
  const byPath = new Map<string, Finding[]>();
  for (const f of candidates) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f]);
  const groups = [...byPath.values()].flatMap((list) => {
    const out: Finding[][] = [];
    for (let i = 0; i < list.length; i += PER_CALL) out.push(list.slice(i, i + PER_CALL));
    return out;
  });
  const files = new Map(opts.files.map((f) => [f.path, f]));
  const code = new Map(candidates.map((f) => [f, codeFor(files.get(f.path), opts.snapshot, f)]));

  const verdicts = new Map<Finding, { verdict: string; evidence: string }>();
  let skipped = false;
  let failed = 0;
  await runPool(groups, 3, async (group) => {
    const shown = group
      .map((f, i) => {
        const where =
          f.line === null ? `${f.path}, whole file` : f.startLine && f.startLine !== f.line ? `${f.path}:${f.startLine}-${f.line}` : `${f.path}:${f.line}`;
        return `### Finding ${i + 1} (${f.severity}, ${where})\n**${f.title}**\n${f.body}\n\n\`\`\`\n${code.get(f)}\n\`\`\``;
      })
      .join("\n\n");
    const estimate = (Math.ceil(shown.length / 3.5) + 2500) * STEPS;
    if (opts.budgetLeft() < estimate) {
      skipped = true;
      return;
    }
    try {
      const answer = await agent({
        purpose: "verify",
        role: "smart",
        reviewId: opts.meta.reviewId,
        repositoryId: opts.meta.repositoryId,
        signal: opts.meta.signal,
        system: SYSTEM,
        prompt: `${opts.context}\n\n## Findings to verify\n${shown}`,
        tools: opts.snapshot ? repoTools(opts.snapshot) : {},
        answer: { name: "submit_verdicts", description: "One verdict per finding, by its number.", schema: verdictSchema },
        maxSteps: opts.snapshot ? STEPS : 1,
      });
      if (!answer) {
        failed += group.length;
        log.warn({ review: opts.meta.reviewId, path: group[0]!.path }, "verification gave no answer, posting unverified");
        return;
      }
      for (const v of answer.verdicts) {
        const f = group[Math.round(v.index) - 1];
        if (f) verdicts.set(f, { verdict: v.verdict.trim().toLowerCase(), evidence: v.evidence?.trim() ?? "" });
      }
    } catch (err) {
      if (err instanceof CancelledError || opts.meta.signal?.aborted) throw err;
      failed += group.length;
      log.warn({ review: opts.meta.reviewId, path: group[0]!.path, err: errMessage(err) }, "verification failed, posting unverified");
    }
  });

  const rejected: Rejected[] = [];
  let confirmed = 0;
  const kept: Finding[] = [];
  for (const f of opts.findings) {
    const v = verdicts.get(f);
    const isGrounded = !!v?.evidence && grounded(v.evidence, f, code.get(f) ?? "", files, opts.snapshot);
    if (v?.verdict === "rejected" && explains(v.evidence) && rejectionGrounded(v.evidence, f, code.get(f) ?? "", files, opts.snapshot)) {
      rejected.push({ finding: f, reason: v.evidence });
      continue;
    }
    if (v?.verdict === "confirmed" && isGrounded) {
      confirmed++;
      kept.push({ ...f, verified: true, evidence: v.evidence });
    } else {
      kept.push(f);
    }
  }
  return { findings: kept, rejected, checked: verdicts.size, confirmed, failed, skipped };
}
