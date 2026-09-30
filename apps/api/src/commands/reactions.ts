import * as findingsRepo from "../db/repos/findings.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import type { PullRequest } from "../db/schema.ts";
import { installationClient, splitFullName, type GitHub } from "../github/app.ts";
import { listPullComments, type Repo } from "../github/pr.ts";
import { dismissFinding } from "../learnings/dismiss.ts";
import { errMessage, log } from "../log.ts";
import { registerJob } from "../queue/worker.ts";

/** Who gave the thumbs-down, when GitHub says (people only). */
async function thumbsDownBy(gh: GitHub, r: Repo, commentId: number): Promise<string | null> {
  try {
    const { data } = await gh.rest.reactions.listForPullRequestReviewComment({ ...r, comment_id: commentId, content: "-1", per_page: 20 });
    return data.find((x) => x.user && x.user.type !== "Bot")?.user?.login ?? null;
  } catch {
    return null;
  }
}

/**
 * A 👎 on one of PR Guard's line comments dismisses that finding and saves a learning. Runs at the
 * start of every review of the PR (so it applies right away) and when the PR closes. Never throws.
 */
export async function sweepReactions(gh: GitHub, r: Repo, pr: PullRequest): Promise<number> {
  try {
    const open = findingsRepo.listOpenCommentedForPull(pr.id);
    if (open.length === 0) return 0;
    const comments = new Map((await listPullComments(gh, r, pr.number)).map((c) => [c.id, c]));
    let dismissed = 0;
    for (const f of open) {
      const c = comments.get(f.githubCommentId!);
      if (!c || c.thumbsDown === 0) continue;
      const author = await thumbsDownBy(gh, r, c.id);
      if (!author) continue;
      await dismissFinding({ gh, r, finding: f, reason: null, source: "reaction", author, url: f.githubCommentUrl });
      dismissed++;
    }
    if (dismissed) log.info({ pr: pr.number, dismissed }, "findings dismissed by thumbs-down");
    return dismissed;
  } catch (err) {
    log.warn({ pr: pr.number, err: errMessage(err) }, "could not read reactions");
    return 0;
  }
}

registerJob("sweep_reactions", async (payload) => {
  const repo = repositoriesRepo.get(Number(payload.repositoryId));
  const pr = pullsRepo.getByNumber(Number(payload.repositoryId), Number(payload.number));
  if (!repo || repo.removedAt || !pr) return;
  const gh = await installationClient(repo.installationId);
  await sweepReactions(gh, splitFullName(repo.fullName), pr);
});
