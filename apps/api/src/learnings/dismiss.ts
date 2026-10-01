import * as findingsRepo from "../db/repos/findings.ts";
import type { FindingRow } from "../db/repos/findings.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { LearningRow } from "../db/schema.ts";
import type { GitHub } from "../github/app.ts";
import { minimizeComment, type Repo } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { openCheckTitle } from "../review/publish.ts";
import { learnFrom } from "./learn.ts";

/** Updates the title of the PR's latest check run to its open findings, keeping its summary. */
export async function refreshCheckTitle(gh: GitHub, r: Repo, pullRequestId: number): Promise<void> {
  const latest = reviewsRepo.listForPull(pullRequestId).find((x) => x.status === "completed" && x.checkRunId);
  if (!latest?.checkRunId) return;
  try {
    const { data } = await gh.rest.checks.get({ ...r, check_run_id: latest.checkRunId });
    const check = openCheckTitle(findingsRepo.listOpenForPull(pullRequestId), 0);
    await gh.rest.checks.update({
      ...r,
      check_run_id: latest.checkRunId,
      conclusion: check.conclusion,
      output: { title: check.title, summary: data.output?.summary ?? check.title },
    });
  } catch (err) {
    log.warn({ pr: pullRequestId, err: errMessage(err) }, "could not refresh the check run title");
  }
}

/**
 * The team does not want this finding: it is dismissed, a learning is saved for the repository, its
 * comment is collapsed and the check run recounts. GitHub failures are logged, never thrown.
 */
export async function dismissFinding(opts: {
  gh: GitHub;
  r: Repo;
  finding: FindingRow;
  reason: string | null;
  source: LearningRow["source"];
  author: string | null;
  url: string | null;
}): Promise<LearningRow> {
  const f = opts.finding;
  const learning = await learnFrom({
    repositoryId: f.repositoryId,
    finding: { id: f.id, path: f.path, category: f.category, fingerprint: f.fingerprint, title: f.title, body: f.body },
    reason: opts.reason,
    source: opts.source,
    author: opts.author,
    url: opts.url,
  });
  findingsRepo.update(f.id, { status: "dismissed", dismissedBy: opts.author, dismissedAt: Date.now(), learningId: learning.id });
  if (f.githubNodeId) {
    await minimizeComment(opts.gh, f.githubNodeId).catch((err) => log.warn({ finding: f.id, err: errMessage(err) }, "could not collapse the comment"));
  }
  await refreshCheckTitle(opts.gh, opts.r, f.pullRequestId);
  log.info({ finding: f.id, learning: learning.id, source: opts.source }, "finding dismissed");
  return learning;
}
