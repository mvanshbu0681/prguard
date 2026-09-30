import * as installationsRepo from "../db/repos/installations.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import type { Repository } from "../db/schema.ts";
import { saveRepos } from "../github/reconcile.ts";
import { on } from "../github/webhooks.ts";
import { log } from "../log.ts";
import { cancelKey, reviewKey } from "../queue/queue.ts";
import { closeReview, triggerReview } from "./lifecycle.ts";

const REVIEW_ACTIONS = new Set(["opened", "reopened", "ready_for_review", "synchronize"]);

function ensureRepo(payload: any): Repository | undefined {
  const id: number = payload.repository.id;
  if (!repositoriesRepo.get(id)) saveRepos(payload.installation.id, [payload.repository]);
  return repositoriesRepo.get(id);
}

on("pull_request", async (payload) => {
  const repo = ensureRepo(payload);
  if (!repo) return;
  const p = payload.pull_request;
  const pr = pullsRepo.upsert({
    repositoryId: repo.id,
    number: p.number,
    title: p.title,
    body: p.body ?? null,
    authorLogin: p.user?.login ?? "unknown",
    authorAvatar: p.user?.avatar_url ?? null,
    url: p.html_url,
    state: p.merged ? "merged" : p.state,
    draft: Boolean(p.draft),
    headSha: p.head.sha,
    baseSha: p.base?.sha ?? null,
    baseRef: p.base?.ref ?? null,
    headRef: p.head?.ref ?? null,
  });

  const action: string = payload.action;
  if (REVIEW_ACTIONS.has(action)) {
    const installation = installationsRepo.get(repo.installationId);
    if (pr.draft || pr.state !== "open") return;
    if (!repo.enabled || repo.removedAt || installation?.suspended) {
      log.info({ repo: repo.fullName, pr: pr.number }, "review skipped: repository off");
      return;
    }
    await triggerReview(repo, pr, action);
    return;
  }

  if (action === "closed" || action === "converted_to_draft") {
    const cancelled = cancelKey(reviewKey(repo.id, pr.number));
    for (const job of cancelled) await closeReview(Number(job.payload.reviewId), action === "closed" ? "closed" : "draft");
  }
});
