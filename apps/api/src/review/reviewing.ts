import { agent } from "../llm/call.ts";
import { log } from "../log.ts";
import { renderFile, type FileDiff } from "./diff.ts";
import { submitSchema, type RawFinding } from "./findings.ts";
import type { Reviewer } from "./reviewers/index.ts";
import { repoTools } from "./tools.ts";

function systemFor(reviewer: Reviewer, withTools: boolean, maxSteps: number): string {
  return `You are the "${reviewer.name}" reviewer of PR Guard, reviewing one part of a pull request like a senior engineer.

${reviewer.instructions}

How to read the diff:
- Every kept line shows its line number in the NEW version of the file.
- Lines marked "+" are added by this pull request: review those. Lines marked " " are unchanged context. Lines marked "-" were removed and have no new line number.

How to work:
${
  withTools
    ? `- You can call read_file, search_code and list_files to check definitions, callers or conventions. Use them only when it changes your judgment, at most ${Math.max(1, maxSteps - 2)} calls.\n`
    : ""
}- Finish by calling submit_findings exactly once with every finding. Use an empty list when nothing is worth reporting.

Each finding:
- path: the file path exactly as written after "FILE:".
- line: the new-file line number of the problem, from the diff, on a "+" line whenever possible. end_line: the last line when the problem spans several lines, otherwise null.
- severity: "critical" (security hole, data loss, crash on a main path), "high" (a real bug users will hit), "medium" (a bug in an edge case, or a risky pattern), "low" (maintainability, unclear naming, minor inefficiency), "nit" (style or wording).
- category: one word, e.g. bug, security, performance, error-handling, concurrency, naming, style, rules.
- title: at most 10 words, specific.
- body: 1 to 3 short sentences: what is wrong, why it matters, how to fix it. Friendly and direct, no preamble.
- In title and body, put identifiers, file paths, commands, config keys and literal values in single backticks, e.g. \`create_refund\`, \`app/models.py\`, \`None\`.
- suggestion: only when the fix is small and certain, the exact replacement code for lines line..end_line (whole lines, same indentation). Otherwise null.
- confidence: 0 to 1, how sure you are that this is a real problem.
- details: null, unless your instructions ask for a folded extra section; then { title, body }.

Stay inside your focus above: other reviewers cover everything else, so reporting it here only adds noise.
Never report that something is fine, needs no change, or has nothing to fix: submit an empty list instead.
Report only real, specific problems in the added code. Report each problem once, not on every line it appears. Do not praise, do not summarise the change, and skip what a formatter would fix unless the team rules require it.`;
}

export type ReviewTask = { reviewer: Reviewer; chunk: FileDiff[]; index: number };

export async function reviewChunk(opts: {
  task: ReviewTask;
  chunkCount: number;
  otherFiles: string[];
  context: string;
  snapshot: string | null;
  focus?: Map<string, Set<number>>;
  meta: { reviewId: number; repositoryId: number; signal?: AbortSignal };
}): Promise<RawFinding[] | null> {
  const { reviewer, chunk, index } = opts.task;
  const withTools = reviewer.tools && opts.snapshot !== null;
  const maxSteps = reviewer.maxSteps ?? 6;
  const diff = chunk.map((f) => renderFile(f, { focus: opts.focus?.get(f.path) })).join("\n\n");
  const prompt = [
    opts.context,
    opts.chunkCount > 1 ? `This is part ${index + 1} of ${opts.chunkCount} of the pull request.` : "",
    opts.focus ? "Only the lines marked + are new since the last review. Review those." : "",
    `## Diff to review\n${diff}`,
    opts.otherFiles.length ? `## Other files in this pull request (reviewed separately)\n${opts.otherFiles.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await agent({
    purpose: `reviewer:${reviewer.id}`,
    role: reviewer.role,
    reviewId: opts.meta.reviewId,
    repositoryId: opts.meta.repositoryId,
    signal: opts.meta.signal,
    system: systemFor(reviewer, withTools, maxSteps),
    prompt,
    tools: withTools ? repoTools(opts.snapshot!) : {},
    answer: {
      name: "submit_findings",
      description: "Submit every finding for this part of the pull request. Call exactly once; use an empty list when there is nothing to report.",
      schema: submitSchema,
    },
    maxSteps: withTools ? maxSteps : 1,
  });
  if (!result) {
    log.warn({ reviewer: reviewer.id, chunk: index }, "reviewer returned no usable answer");
    return null;
  }
  return result.findings.map((f) => ({ ...f, reviewer: reviewer.id }));
}
