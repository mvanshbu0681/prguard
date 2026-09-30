import * as installationsRepo from "../db/repos/installations.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { getPull } from "../github/pr.ts";
import type { PullRequest, Repository } from "../db/schema.ts";
import { saveRepos } from "../github/reconcile.ts";
import { on } from "../github/webhooks.ts";
import { log } from "../log.ts";
import { cancelKey, reviewKey } from "../queue/queue.ts";
import { closeReview, triggerReview } from "./lifecycle.ts";
import { rerankFromLabels } from "./rank.ts";

const REVIEW_ACTIONS = new Set(["opened", "reopened", "ready_for_review", "synchronize"]);

export function ensureRepo(payload: any): Repository | undefined {
  const id: number = payload.repository.id;
  if (!repositoriesRepo.get(id)) saveRepos(payload.installation.id, [payload.repository]);
  return repositoriesRepo.get(id);
}

/** Stores a pull request from a webhook payload or the REST API (same shape). */
export function savePull(repo: Repository, p: any): PullRequest {
  return pullsRepo.upsert({
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
    labels: ((p.labels ?? []) as { name?: string }[]).map((l) => l.name ?? "").filter(Boolean),
  });
}

on("pull_request", async (payload) => {
  const repo = ensureRepo(payload);
  if (!repo) return;
  const p = payload.pull_request;
  const pr = savePull(repo, p);

  const action: string = payload.action;
  if (action === "labeled" || action === "unlabeled") {
    rerankFromLabels(pr);
    return;
  }
  if (REVIEW_ACTIONS.has(action)) {
    const installation = installationsRepo.get(repo.installationId);
    if (pr.draft || pr.state !== "open") return;
    if (!repo.enabled || repo.removedAt || installation?.suspended) {
      log.info({ repo: repo.fullName, pr: pr.number }, "review skipped: repository off");
      return;
    }
    // A late or repeated push event for a commit that is already reviewed, or being reviewed, adds nothing.
    const head: string = p.head.sha;
    // Reopening or marking ready on an already-reviewed commit keeps that review's result.
    if (action !== "opened" && pr.lastReviewedSha === head) return;
    if (reviewsRepo.listOpenForPull(pr.id).some((r) => r.headSha === head)) return;
    await triggerReview(repo, pr, action);
    return;
  }

  if (action === "closed" || action === "converted_to_draft") {
    // Events can arrive out of order: only stop reviews if the PR really is closed or a draft now.
    const gh = await installationClient(repo.installationId);
    const live = await getPull(gh, splitFullName(repo.fullName), pr.number);
    if (live.state === "open" && !live.draft) return;
    const cancelled = cancelKey(reviewKey(repo.id, pr.number));
    for (const job of cancelled) await closeReview(Number(job.payload.reviewId), live.state === "open" ? "draft" : "closed");
  }
});
