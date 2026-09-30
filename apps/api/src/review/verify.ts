import { z } from "zod";
import { agent } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError } from "../queue/worker.ts";
import { newLineText, type FileDiff } from "./diff.ts";
import { runPool } from "./engine.ts";
import { readFile, repoTools } from "./tools.ts";
import type { Finding } from "./types.ts";

const WINDOW = 30;
const PER_CALL = 5;
const STEPS = 3;
const VERIFIED_SEVERITIES = new Set(["critical", "high", "medium"]);

const verdictSchema = z.object({
  verdicts: z.array(z.object({ index: z.number(), verdict: z.string(), evidence: z.string() })),
});

const SYSTEM = `You verify findings from PR Guard's code reviewers before they are posted on a pull request.
For each numbered finding, check it against the code shown and, when needed, the rest of the repository (read_file, search_code).
- "confirmed": the code shows the problem is real. evidence: one or two sentences citing the code that proves it, as \`path:line\`, with identifiers in backticks.
- "rejected": only when the code shows the finding is wrong, for example the case is handled, the value cannot be null, or the check exists elsewhere. evidence: the code that shows it, as \`path:line\`.
- "unsure": anything else. Unsure findings are still posted.
Never reject a finding for being minor, or because the fix is hard. Answer by calling submit_verdicts once with one verdict per finding.`;

export type Rejected = { finding: Finding; reason: string };

export type Verification = { findings: Finding[]; rejected: Rejected[]; checked: number; confirmed: number; skipped: boolean };

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

/** Cited code: a `path:line` or a code span. A rejection without one is treated as unsure. */
function citesCode(evidence: string): boolean {
  return /:\d+/.test(evidence) || /`[^`]+`/.test(evidence);
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
  const candidates = opts.findings.filter(
    (f) => !f.fromCheck && f.line !== null && f.placement !== "hidden" && VERIFIED_SEVERITIES.has(f.severity),
  );
  const byPath = new Map<string, Finding[]>();
  for (const f of candidates) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f]);
  const groups = [...byPath.values()].flatMap((list) => {
    const out: Finding[][] = [];
    for (let i = 0; i < list.length; i += PER_CALL) out.push(list.slice(i, i + PER_CALL));
    return out;
  });
  const files = new Map(opts.files.map((f) => [f.path, f]));

  const verdicts = new Map<Finding, { verdict: string; evidence: string }>();
  let skipped = false;
  await runPool(groups, 3, async (group) => {
    const shown = group
      .map((f, i) => {
        const where = f.startLine && f.startLine !== f.line ? `${f.path}:${f.startLine}-${f.line}` : `${f.path}:${f.line}`;
        return `### Finding ${i + 1} (${f.severity}, ${where})\n**${f.title}**\n${f.body}\n\n\`\`\`\n${window(files.get(f.path), opts.snapshot, f.path, f.line!)}\n\`\`\``;
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
      for (const v of answer?.verdicts ?? []) {
        const f = group[Math.round(v.index) - 1];
        if (f) verdicts.set(f, { verdict: v.verdict.trim().toLowerCase(), evidence: v.evidence.trim() });
      }
    } catch (err) {
      if (err instanceof CancelledError || opts.meta.signal?.aborted) throw err;
      log.warn({ review: opts.meta.reviewId, path: group[0]!.path, err: errMessage(err) }, "verification failed, posting unverified");
    }
  });

  const rejected: Rejected[] = [];
  let confirmed = 0;
  const kept: Finding[] = [];
  for (const f of opts.findings) {
    const v = verdicts.get(f);
    if (v?.verdict === "rejected" && v.evidence && citesCode(v.evidence)) {
      rejected.push({ finding: f, reason: v.evidence });
      continue;
    }
    if (v?.verdict === "confirmed" && v.evidence) {
      confirmed++;
      kept.push({ ...f, verified: true, evidence: v.evidence });
    } else {
      kept.push(f);
    }
  }
  return { findings: kept, rejected, checked: verdicts.size, confirmed, skipped };
}
