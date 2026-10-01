import * as findingsRepo from "../db/repos/findings.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import type { PullRequest } from "../db/schema.ts";
import { installationClient, splitFullName, type GitHub } from "../github/app.ts";
import { canWrite, listPullComments, type Repo } from "../github/pr.ts";
import { dismissFinding } from "../learnings/dismiss.ts";
import { errMessage, log } from "../log.ts";
import { registerJob } from "../queue/worker.ts";

/**
 * Who gave the thumbs-down, when GitHub says: the first person with write access. A thumbs-down from
 * anyone else teaches PR Guard nothing.
 */
async function thumbsDownBy(gh: GitHub, r: Repo, commentId: number, writers: Map<string, boolean>): Promise<string | null> {
  const data = await gh.rest.reactions
    .listForPullRequestReviewComment({ ...r, comment_id: commentId, content: "-1", per_page: 20 })
    .then((res) => res.data)
    .catch(() => null);
  if (!data) return null;
  for (const x of data) {
    const login = x.user && x.user.type !== "Bot" ? x.user.login : null;
    if (login && (await canWrite(gh, r, login, writers))) return login;
  }
  if (data.length) log.info({ ...r, commentId }, "thumbs-down from users without write access, no learning");
  return null;
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
    const writers = new Map<string, boolean>();
    let dismissed = 0;
    for (const f of open) {
      const c = comments.get(f.githubCommentId!);
      if (!c || c.thumbsDown === 0) continue;
      const author = await thumbsDownBy(gh, r, c.id, writers);
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
