import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as findingsRepo from "../db/repos/findings.ts";
import type { FindingRow } from "../db/repos/findings.ts";
import type { GitHub } from "../github/app.ts";
import { listReviewCommentsOf, minimizeComment, threadsOutdated, updateReviewComment, type Repo } from "../github/pr.ts";
import { structured } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { statusBadge } from "./badges.ts";
import { newLineText, type FileDiff } from "./diff.ts";
import type { Finding } from "./types.ts";

const WINDOW = 15;
const PER_CALL = 10;

const fixSchema = z.object({ results: z.array(z.object({ index: z.number(), fixed: z.boolean(), reason: z.string() })) });

const FIX_SYSTEM = `PR Guard flagged these problems on earlier commits of a pull request. The flagged lines have changed since.
For each numbered problem, compare the old code with the current code and decide whether the problem is fixed.
- fixed: true only when the current code no longer has the problem: it was corrected, or the code was removed without the problem moving elsewhere.
- fixed: false when the problem is still there, was only reformatted or moved, or you cannot tell.
- reason: one short sentence.
Answer only with JSON matching the schema.`;

/** The current code around where a finding used to be, found again by its snippet. */
function currentWindow(f: FindingRow, snapshot: string | null, files: FileDiff[]): string {
  let lines: string[] | null = null;
  if (snapshot) {
    try {
      lines = readFileSync(join(snapshot, f.path), "utf8").split("\n");
    } catch {
      lines = null;
    }
  }
  if (!lines) {
    const file = files.find((x) => x.path === f.path);
    if (!file) return "(this file was deleted or is no longer in the pull request)";
    const text = newLineText(file);
    lines = [];
    for (const [n, t] of text) lines[n - 1] = t;
  }
  const snippet = (f.snippet ?? "").split("\n").map((s) => s.trim()).filter((s) => s.length >= 6);
  let at = -1;
  for (const probe of snippet) {
    at = lines.findIndex((l) => (l ?? "").trim() === probe);
    if (at >= 0) break;
  }
  const center = at >= 0 ? at : Math.max(0, (f.startLine ?? f.line ?? 1) - 1);
  const from = Math.max(0, center - WINDOW);
  const to = Math.min(lines.length, center + WINDOW + (f.snippet?.split("\n").length ?? 1));
  const out: string[] = [];
  for (let i = from; i < to; i++) out.push(`${String(i + 1).padStart(6)} | ${lines[i] ?? ""}`);
  return `${at >= 0 ? "" : "(the old lines were not found as they were; nearest area shown)\n"}${out.join("\n")}`;
}

/** Marks a finding fixed: saved first, then its comment gains the Fixed badge and is collapsed. */
export async function markFixed(gh: GitHub, r: Repo, f: FindingRow, headSha: string): Promise<void> {
  findingsRepo.update(f.id, { status: "fixed", fixedInSha: headSha, fixedAt: Date.now() });
  if (!f.githubCommentId || !f.githubNodeId) return;
  try {
    const { data } = await gh.rest.pulls.getReviewComment({ ...r, comment_id: f.githubCommentId });
    if (!data.body.includes("status-fixed")) {
      await updateReviewComment(gh, r, f.githubCommentId, `${statusBadge("fixed")} Fixed in \`${headSha.slice(0, 7)}\`\n\n${data.body}`);
    }
    await minimizeComment(gh, f.githubNodeId);
  } catch (err) {
    log.warn({ finding: f.id, err: errMessage(err) }, "could not mark the comment fixed on GitHub");
  }
}

/**
 * Checks earlier open findings whose threads GitHub marks outdated (their lines changed) against the
 * current code, a few per `fast` call. Returns the ones now fixed; marking is left to the caller.
 */
export async function detectFixes(opts: {
  gh: GitHub;
  r: Repo;
  prNumber: number;
  open: FindingRow[];
  snapshot: string | null;
  files: FileDiff[];
  meta: { reviewId: number; repositoryId: number; signal?: AbortSignal };
}): Promise<{ fixed: FindingRow[]; checked: number }> {
  if (opts.open.length === 0) return { fixed: [], checked: 0 };
  const outdated = await threadsOutdated(opts.gh, opts.r, opts.prNumber);
  const candidates = opts.open.filter((f) => f.githubCommentId && outdated.get(f.githubCommentId) === true);
  const fixed: FindingRow[] = [];
  for (let i = 0; i < candidates.length; i += PER_CALL) {
    const batch = candidates.slice(i, i + PER_CALL);
    const prompt = batch
      .map(
        (f, n) =>
          `### Problem ${n + 1}: ${f.title} (\`${f.path}\`)\n${f.body}\n\nOld code:\n\`\`\`\n${f.snippet ?? "(not recorded)"}\n\`\`\`\n\nCurrent code:\n\`\`\`\n${currentWindow(f, opts.snapshot, opts.files)}\n\`\`\``,
      )
      .join("\n\n");
    try {
      const answer = await structured({ ...opts.meta, purpose: "fixes", role: "fast", system: FIX_SYSTEM, prompt, schema: fixSchema });
      for (const res of answer.results) {
        const f = batch[Math.round(res.index) - 1];
        if (f && res.fixed) fixed.push(f);
      }
    } catch (err) {
      if (opts.meta.signal?.aborted) throw err;
      log.warn({ review: opts.meta.reviewId, err: errMessage(err) }, "fix check failed, findings stay open");
    }
  }
  return { fixed, checked: candidates.length };
}

const MAX_SNIPPET_LINES = 20;

/** The finding's lines as they are at this head, kept to find them again after later pushes. */
export function snippetOf(f: Finding, files: FileDiff[]): string | null {
  if (f.line === null) return null;
  const file = files.find((x) => x.path === f.path);
  if (!file) return null;
  const text = newLineText(file);
  const lines: string[] = [];
  for (let l = f.startLine ?? f.line; l <= f.line && lines.length < MAX_SNIPPET_LINES; l++) {
    const t = text.get(l);
    if (t !== undefined) lines.push(t);
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * After a review is posted, links each inline finding to its GitHub comment (id, node id, URL) by
 * path and title, so later pushes, commands and reactions can find it. Never throws.
 */
export async function recordCommentIds(gh: GitHub, r: Repo, prNumber: number, githubReviewId: number, reviewId: number): Promise<number> {
  try {
    const rows = findingsRepo.listForReview(reviewId).filter((f) => f.placement === "inline" && !f.githubCommentId);
    if (rows.length === 0) return 0;
    const comments = await listReviewCommentsOf(gh, r, prNumber, githubReviewId);
    const used = new Set<number>();
    let matched = 0;
    for (const row of rows) {
      const c = comments.find((x) => !used.has(x.id) && x.path === row.path && x.body.includes(`**${row.title}**`));
      if (!c) continue;
      used.add(c.id);
      findingsRepo.update(row.id, { githubCommentId: c.id, githubNodeId: c.nodeId, githubCommentUrl: c.url });
      matched++;
    }
    if (matched < rows.length) log.info({ review: reviewId, matched, inline: rows.length }, "some findings have no matching comment");
    return matched;
  } catch (err) {
    log.warn({ review: reviewId, err: errMessage(err) }, "could not link findings to their comments");
    return 0;
  }
}
