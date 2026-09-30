import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { finishCheckRun, removeReaction } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError, FatalError, registerJob, type JobContext } from "../queue/worker.ts";
import { cancelReason, closeReview } from "./lifecycle.ts";

async function runReview(payload: Record<string, unknown>, ctx: JobContext): Promise<void> {
  const reviewId = Number(payload.reviewId);
  const review = reviewsRepo.get(reviewId);
  if (!review || !["queued", "running"].includes(review.status)) return;
  const pr = pullsRepo.get(review.pullRequestId)!;
  const repo = repositoriesRepo.get(review.repositoryId)!;
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  const reviewLog = log.child({ review: reviewId, repo: repo.fullName, pr: pr.number });

  try {
    ctx.checkCancelled();
    reviewsRepo.update(reviewId, { status: "running", stage: "fetching", startedAt: Date.now(), error: null });

    reviewsRepo.update(reviewId, { status: "completed", stage: "done", finishedAt: Date.now() });
    if (review.checkRunId) await finishCheckRun(gh, r, review.checkRunId, "neutral", "Review complete", "No reviewers ran.");
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    reviewLog.info("review completed");
  } catch (err) {
    if (err instanceof CancelledError) {
      const current = pullsRepo.get(pr.id);
      await closeReview(reviewId, cancelReason(current, repositoriesRepo.get(repo.id)));
      throw err;
    }
    if (!ctx.isLastAttempt && !(err instanceof FatalError)) {
      reviewsRepo.update(reviewId, { status: "queued", stage: "queued" });
      throw err;
    }
    reviewLog.error({ err: errMessage(err) }, "review failed");
    reviewsRepo.update(reviewId, { status: "failed", stage: "done", error: "Review failed.", finishedAt: Date.now() });
    if (review.checkRunId) {
      await finishCheckRun(gh, r, review.checkRunId, "neutral", "Review failed", "Something went wrong. Re-run it from the dashboard.");
    }
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    throw new FatalError(errMessage(err));
  }
}

registerJob("review_pr", runReview);
