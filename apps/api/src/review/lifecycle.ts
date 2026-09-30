import { config } from "../config.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { PullRequest, Repository, Review } from "../db/schema.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { addEyes, createCompletedCheckRun, finishCheckRun, removeReaction, startCheckRun } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { briefKey, cancelKey, enqueue, reviewKey } from "../queue/queue.ts";

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
  let reactionId: number | null = null;
  let checkRunId: number | null = null;
  try {
    const gh = await installationClient(repo.installationId);
    const r = splitFullName(repo.fullName);
    [reactionId, checkRunId] = await Promise.all([addEyes(gh, r, pr.number), startCheckRun(gh, r, pr.headSha, reviewUrl(review.id))]);
    reviewsRepo.update(review.id, { reactionId, checkRunId });
    log.info({ review: review.id, repo: repo.fullName, pr: pr.number, trigger }, "review acknowledged");
  } catch (err) {
    // The review still runs; it just goes without the instant signal.
    log.warn({ review: review.id, err: errMessage(err) }, "could not acknowledge the pull request");
  }

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

/** Marks a review failed and closes it out on GitHub (neutral check run, 👀 removed). Never throws. */
export async function failReview(reviewId: number): Promise<void> {
  const review = reviewsRepo.get(reviewId);
  if (!review || !["queued", "running"].includes(review.status)) return;
  reviewsRepo.update(reviewId, { status: "failed", stage: "done", error: "Review failed.", finishedAt: Date.now() });
  const pr = pullsRepo.get(review.pullRequestId);
  const repo = repositoriesRepo.get(review.repositoryId);
  if (!pr || !repo) return;
  try {
    const gh = await installationClient(repo.installationId);
    const r = splitFullName(repo.fullName);
    const text = ["Review failed", "Something went wrong. Re-run it from the dashboard."] as const;
    if (review.checkRunId) await finishCheckRun(gh, r, review.checkRunId, "neutral", ...text);
    // A review that took over a newer push has no check run yet; the newest commit still needs one.
    else await createCompletedCheckRun(gh, r, review.headSha, reviewUrl(review.id), "neutral", ...text);
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
  } catch (err) {
    log.warn({ review: reviewId, err: errMessage(err) }, "could not close a failed review on GitHub");
  }
}

/** Stops all pending work for repositories PR Guard lost access to or that were switched off. */
export async function cancelRepoWork(repositoryIds: number[], reason: CloseReason): Promise<void> {
  for (const id of repositoryIds) {
    const cancelled = [...cancelKey(`pr:${id}:`, true), ...cancelKey(briefKey(id))];
    for (const job of cancelled) if (job.type === "review_pr") await closeReview(Number(job.payload.reviewId), reason);
    if (reason === "removed") for (const review of reviewsRepo.listOpenForRepos([id])) await closeReview(review.id, reason);
  }
}

/** Why a running review was asked to stop, judged from the PR's current state. */
export function cancelReason(pr: PullRequest | undefined, repo: Repository | undefined): CloseReason {
  if (!repo || repo.removedAt) return "removed";
  if (!repo.enabled) return "disabled";
  if (!pr || pr.state !== "open") return "closed";
  if (pr.draft) return "draft";
  return "superseded";
}
