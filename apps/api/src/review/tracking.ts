import * as findingsRepo from "../db/repos/findings.ts";
import type { GitHub } from "../github/app.ts";
import { listReviewCommentsOf, type Repo } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { newLineText, type FileDiff } from "./diff.ts";
import type { Finding } from "./types.ts";

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
