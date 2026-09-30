import { config } from "../config.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { PullRequest, Repository, Review } from "../db/schema.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { addEyes, finishCheckRun, removeReaction, startCheckRun } from "../github/pr.ts";
import { log } from "../log.ts";
import { enqueue, reviewKey } from "../queue/queue.ts";

export type CloseReason = "superseded" | "closed" | "draft" | "disabled" | "removed";

const closeText: Record<CloseReason, { title: string; summary: string }> = {
  superseded: { title: "Superseded", summary: "A newer push is being reviewed." },
  closed: { title: "Cancelled", summary: "The pull request was closed." },
  draft: { title: "Cancelled", summary: "The pull request is a draft." },
  disabled: { title: "Skipped", summary: "Reviews are off for this repository." },
  removed: { title: "Cancelled", summary: "PR Guard no longer has access to this repository." },
};

export function reviewUrl(reviewId: number): string {
  return `${config.dashboardUrl}/reviews/${reviewId}`;
}

/** Records a review, acknowledges it on the PR (👀 and an in-progress check run), then queues it. */
export async function triggerReview(repo: Repository, pr: PullRequest, trigger: string): Promise<Review> {
  const review = reviewsRepo.create({
    pullRequestId: pr.id,
    repositoryId: repo.id,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    trigger,
  });
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  const [reactionId, checkRunId] = await Promise.all([
    addEyes(gh, r, pr.number),
    startCheckRun(gh, r, pr.headSha, reviewUrl(review.id)),
  ]);
  reviewsRepo.update(review.id, { reactionId, checkRunId });
  log.info({ review: review.id, repo: repo.fullName, pr: pr.number, trigger }, "review acknowledged");

  const { cancelled } = enqueue("review_pr", reviewKey(repo.id, pr.number), { reviewId: review.id });
  for (const job of cancelled) await closeReview(Number(job.payload.reviewId), "superseded");
  return { ...review, reactionId, checkRunId };
}

/** Closes a review that will not run to completion, and says why on its check run. */
export async function closeReview(reviewId: number, reason: CloseReason, repoOverride?: Repository): Promise<void> {
  const review = reviewsRepo.get(reviewId);
  if (!review || !["queued", "running"].includes(review.status)) return;
  reviewsRepo.update(reviewId, {
    status: reason === "disabled" ? "skipped" : "cancelled",
    error: closeText[reason].title,
    finishedAt: Date.now(),
  });

  const pr = pullsRepo.get(review.pullRequestId);
  const repo = repoOverride ?? repositoriesRepo.get(review.repositoryId);
  if (!pr || !repo || reason === "removed") return;
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  if (review.checkRunId) {
    const { title, summary } = closeText[reason];
    await finishCheckRun(gh, r, review.checkRunId, reason === "disabled" ? "skipped" : "cancelled", title, summary);
  }
  if (review.reactionId && reason !== "superseded") await removeReaction(gh, r, pr.number, review.reactionId);
}

/** Why a running review was asked to stop, judged from the PR's current state. */
export function cancelReason(pr: PullRequest | undefined, repo: Repository | undefined): CloseReason {
  if (!repo || repo.removedAt) return "removed";
  if (!repo.enabled) return "disabled";
  if (!pr || pr.state !== "open") return "closed";
  if (pr.draft) return "draft";
  return "superseded";
}
