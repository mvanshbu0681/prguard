import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { PullRequest, Repository, Review } from "../db/schema.ts";
import { installationClient, splitFullName, type GitHub } from "../github/app.ts";
import { finishCheckRun, getPull, listFiles, postReview, removeReaction, type Repo } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError, FatalError, registerJob, type JobContext } from "../queue/worker.ts";
import { buildContext } from "./context.ts";
import { toFileDiffs, type FileDiff } from "./diff.ts";
import { cancelReason, closeReview, reviewUrl } from "./lifecycle.ts";
import { classify } from "./noise.ts";
import { checkTitle, reviewBody, toComments } from "./publish.ts";
import { summarize } from "./summarize.ts";
import type { Finding } from "./types.ts";

type Run = {
  review: Review;
  pr: PullRequest;
  repo: Repository;
  gh: GitHub;
  r: Repo;
  ctx: JobContext;
};

function stage(reviewId: number, s: Review["stage"]): void {
  reviewsRepo.update(reviewId, { stage: s });
}

async function pipeline(run: Run): Promise<void> {
  const { review, gh, r, ctx } = run;
  let { pr } = run;

  run.ctx.checkCancelled();
  reviewsRepo.update(review.id, { status: "running", stage: "fetching", startedAt: Date.now(), error: null });

  const live = await getPull(gh, r, pr.number);
  pullsRepo.update(pr.id, {
    title: live.title,
    body: live.body ?? null,
    headSha: live.head.sha,
    baseSha: live.base.sha,
    draft: Boolean(live.draft),
    state: live.merged ? "merged" : (live.state as "open" | "closed"),
  });
  pr = pullsRepo.get(pr.id)!;
  if (live.head.sha !== review.headSha || pr.state !== "open" || pr.draft) throw new CancelledError();

  const files: FileDiff[] = toFileDiffs(await listFiles(gh, r, pr.number));
  const { reviewable, skipped, docsOnly } = classify(files);
  reviewsRepo.update(review.id, { kind: "full", baseSha: live.base.sha, filesSkipped: skipped });
  ctx.checkCancelled();

  const context = buildContext(pr);
  const meta = { reviewId: review.id, repositoryId: run.repo.id };

  let summary: string | null = null;
  let walkthrough: { path: string; change: string }[] = [];
  if (reviewable.length) {
    stage(review.id, "summarizing");
    const s = await summarize({ context, files: reviewable, incremental: false, meta });
    summary = s.summary;
    walkthrough = s.walkthrough;
  }
  ctx.checkCancelled();

  const findings: Finding[] = [];

  stage(review.id, "publishing");
  const note =
    reviewable.length === 0
      ? "Nothing to review: only deleted, binary, generated or lock files changed."
      : docsOnly
        ? "Documentation only, so this is a summary without a code review."
        : null;

  const body = reviewBody({
    summary,
    walkthrough,
    kind: "full",
    range: null,
    findings,
    skipped,
    notReviewed: [],
    filesReviewed: reviewable.length,
    note,
    reviewUrl: reviewUrl(review.id),
  });

  let posted: { id: number; url: string } | null = null;
  if (!review.githubReviewId) posted = await postReview(gh, r, pr.number, review.headSha, body, toComments(findings));

  reviewsRepo.update(review.id, {
    status: "completed",
    stage: "done",
    summary,
    walkthrough,
    filesReviewed: reviewable.length,
    ...(posted ? { githubReviewId: posted.id, githubReviewUrl: posted.url } : {}),
    finishedAt: Date.now(),
  });
  pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });

  const check = checkTitle(findings);
  if (review.checkRunId) {
    await finishCheckRun(gh, r, review.checkRunId, check.conclusion, check.title, `${summary ?? note ?? ""}\n\n[Open in PR Guard](${reviewUrl(review.id)})`);
  }
  if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
}

async function runReview(payload: Record<string, unknown>, ctx: JobContext): Promise<void> {
  const reviewId = Number(payload.reviewId);
  const review = reviewsRepo.get(reviewId);
  if (!review || !["queued", "running"].includes(review.status)) return;
  const pr = pullsRepo.get(review.pullRequestId)!;
  const repo = repositoriesRepo.get(review.repositoryId)!;
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  const reviewLog = log.child({ review: reviewId, repo: repo.fullName, pr: pr.number });
  const started = Date.now();

  try {
    await pipeline({ review, pr, repo, gh, r, ctx });
    reviewLog.info({ ms: Date.now() - started }, "review completed");
  } catch (err) {
    if (err instanceof CancelledError) {
      await closeReview(reviewId, cancelReason(pullsRepo.get(pr.id), repositoriesRepo.get(repo.id)));
      throw err;
    }
    if (!ctx.isLastAttempt && !(err instanceof FatalError)) {
      reviewLog.warn({ err: errMessage(err) }, "review attempt failed, retrying");
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
