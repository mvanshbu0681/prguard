import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { PullRequest, Repository, Review } from "../db/schema.ts";
import { installationClient, splitFullName, type GitHub } from "../github/app.ts";
import {
  compare,
  findPostedReview,
  finishCheckRun,
  getPull,
  listFiles,
  postReview,
  removeReaction,
  type PrFile,
  type Repo,
} from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError, FatalError, registerJob, type JobContext } from "../queue/worker.ts";
import { queueBrief } from "../brief/index-repo.ts";
import { buildContext } from "./context.ts";
import { config } from "../config.ts";
import { addedLines, packChunks, toFileDiffs, windowHunks, type FileDiff } from "./diff.ts";
import { cancelReason, closeReview, reviewUrl } from "./lifecycle.ts";
import * as findingsRepo from "../db/repos/findings.ts";
import { getSnapshot } from "../github/snapshot.ts";
import { processFindings, type RawFinding } from "./findings.ts";
import { classify, fileKind, KIND_PRIORITY } from "./noise.ts";
import { checkTitle, reviewBody, toComments, withInlineInBody } from "./publish.ts";
import { enabledReviewers } from "./reviewers/index.ts";
import { reviewChunk } from "./reviewing.ts";
import { summarize } from "./summarize.ts";
import type { Finding } from "./types.ts";

const REVIEW_PARALLELISM = 3;

/** Runs `fn` over items with at most `limit` in flight; the first error stops new work and is rethrown. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (next < items.length && failure === null) {
      const item = items[next++]!;
      try {
        await fn(item);
      } catch (err) {
        failure ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure !== null) throw failure;
}

type Run = {
  review: Review;
  pr: PullRequest;
  repo: Repository;
  gh: GitHub;
  r: Repo;
  ctx: JobContext;
  signal: AbortSignal;
};

function stage(reviewId: number, s: Review["stage"]): void {
  reviewsRepo.update(reviewId, { stage: s });
}

type Scope = {
  kind: "full" | "incremental";
  files: FileDiff[];
  focus: Map<string, Set<number>> | undefined;
  range: { from: string; to: string } | null;
};

/**
 * What this review covers. After a previous review, only the new commits: lines added both in the
 * compare from the last reviewed commit and in the PR diff (so merges from the base branch add
 * nothing). A force-push or an unavailable compare falls back to the whole PR.
 */
async function resolveScope(run: Run, pr: PullRequest, files: FileDiff[]): Promise<Scope> {
  const full: Scope = { kind: "full", files, focus: undefined, range: null };
  const last = pr.lastReviewedSha;
  if (!last || run.review.trigger === "manual") return full;
  if (last === run.review.headSha) return { kind: "incremental", files: [], focus: new Map(), range: { from: last, to: last } };

  const cmp = await compare(run.gh, run.r, last, run.review.headSha);
  if (!cmp || cmp.status !== "ahead") return full;

  const newFiles = toFileDiffs((cmp.files ?? []) as PrFile[]);
  const focus = new Map<string, Set<number>>();
  for (const nf of newFiles) {
    const prFile = files.find((f) => f.path === nf.path);
    if (!prFile) continue;
    const inPr = addedLines(prFile);
    const both = [...addedLines(nf)].filter((l) => inPr.has(l));
    if (both.length) focus.set(nf.path, new Set(both));
  }
  const scoped = files.filter((f) => focus.has(f.path)).map((f) => ({ ...f, hunks: windowHunks(f.hunks, focus.get(f.path)!) }));
  return { kind: "incremental", files: scoped, focus, range: { from: last, to: run.review.headSha } };
}

async function pipeline(run: Run): Promise<void> {
  const { review, gh, r, ctx } = run;
  let { pr } = run;

  run.ctx.checkCancelled();
  const repoNow = repositoriesRepo.get(run.repo.id);
  if (!repoNow || repoNow.removedAt || !repoNow.enabled) throw new CancelledError();
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
  const scope = await resolveScope(run, pr, files);
  const { kind, focus, range } = scope;
  const { reviewable, skipped, docsOnly } = classify(scope.files);
  const anchorFiles = classify(files).reviewable;
  reviewsRepo.update(review.id, { kind, baseSha: live.base.sha, filesSkipped: skipped });
  ctx.checkCancelled();

  if (kind === "incremental" && reviewable.length === 0) {
    reviewsRepo.update(review.id, { status: "completed", stage: "done", summary: "No new changes to review.", finishedAt: Date.now() });
    pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });
    if (review.checkRunId) await finishCheckRun(gh, r, review.checkRunId, "success", "No new changes", "Nothing new to review since the last review.");
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    return;
  }

  if (repoNow.briefStatus === "none") queueBrief(repoNow.id);
  const context = buildContext(pr, repoNow);
  const meta = { reviewId: review.id, repositoryId: run.repo.id, signal: run.signal };

  const active = enabledReviewers(run.repo.disabledReviewers);
  const codeFiles = docsOnly ? [] : reviewable.filter((f) => fileKind(f.path) !== "docs");
  const deep = codeFiles.length > 0 && active.length > 0;

  let summary: string | null = null;
  let walkthrough: { path: string; change: string }[] = [];
  let raw: RawFinding[] = [];
  let failedChunks = 0;
  let notReviewed: string[] = [];
  let budgetHit = false;
  let reserved = 0;
  stage(review.id, deep ? "reviewing" : "summarizing");

  const summaryTask = reviewable.length
    ? summarize({ context, files: reviewable, incremental: kind === "incremental", focus, meta }).then((s) => {
        summary = s.summary;
        walkthrough = s.walkthrough;
      })
    : Promise.resolve();

  const reviewTask = deep
    ? (async () => {
        const snapshot = await getSnapshot(gh, run.repo.id, run.repo.fullName, review.headSha).catch((err) => {
          log.warn({ review: review.id, err: errMessage(err) }, "snapshot unavailable, reviewing without tools");
          return null;
        });
        ctx.checkCancelled();
        const ordered = [...codeFiles].sort(
          (a, b) => KIND_PRIORITY[fileKind(a.path)] - KIND_PRIORITY[fileKind(b.path)] || a.path.localeCompare(b.path),
        );
        const packed = packChunks(ordered, { chunkTokens: config.review.chunkTokens, maxChunks: config.review.maxChunks, focus });
        notReviewed = packed.notReviewed;
        const chunks = packed.chunks;
        const tasks = chunks.flatMap((chunk, index) => active.map((reviewer) => ({ reviewer, chunk: chunk.files, index, tokens: chunk.tokens })));
        const allPaths = [...new Set(codeFiles.map((f) => f.path))];

        await runPool(tasks, REVIEW_PARALLELISM, async (task) => {
          ctx.checkCancelled();
          const spent = reviewsRepo.get(review.id)!;
          const steps = task.reviewer.tools && snapshot ? (task.reviewer.maxSteps ?? 4) : 1;
          const estimate = (task.tokens + 2500) * steps;
          if (spent.tokensIn + spent.tokensOut + reserved + estimate > config.review.tokenBudget) {
            budgetHit = true;
            for (const f of task.chunk) if (!notReviewed.includes(f.path)) notReviewed.push(f.path);
            return;
          }
          reserved += estimate;
          const inChunk = new Set(task.chunk.map((f) => f.path));
          const otherFiles = allPaths.filter((p) => !inChunk.has(p)).slice(0, 60);
          const found = await reviewChunk({ task, chunkCount: chunks.length, otherFiles, context, snapshot, focus, meta })
            .catch((err) => {
              if (err instanceof CancelledError) throw err;
              log.warn({ review: review.id, reviewer: task.reviewer.id, err: errMessage(err) }, "reviewer failed");
              return null;
            })
            .finally(() => {
              reserved -= estimate;
            });
          if (found) raw = raw.concat(found);
          else failedChunks++;
        });
        log.info({ review: review.id, chunks: chunks.length, tasks: tasks.length, notReviewed: notReviewed.length }, "reviewers finished");
      })()
    : Promise.resolve();

  await Promise.all([summaryTask, reviewTask]);
  ctx.checkCancelled();

  const previous = findingsRepo.listPostedForPull(pr.id);
  const processed = processFindings(raw, anchorFiles, previous, focus);
  let findings: Finding[] = processed.findings;
  const partial = failedChunks > 0 || notReviewed.length > 0;
  reviewsRepo.update(review.id, { partial, notReviewed });

  stage(review.id, "publishing");
  const note =
    reviewable.length === 0
      ? "Nothing to review: only deleted, binary, generated or lock files changed."
      : docsOnly
        ? "Documentation only, so this is a summary without a code review."
        : !deep
          ? "Reviewers are off for this repository, so this is a summary only."
          : failedChunks
          ? "Part of this pull request could not be reviewed. Re-run to try again."
          : notReviewed.length
            ? `Reviewed part of this pull request${budgetHit ? " (review budget reached)" : " (size limit reached)"}. Not reviewed: ${notReviewed
                .slice(0, 10)
                .map((p) => `\`${p}\``)
                .join(", ")}${notReviewed.length > 10 ? ` and ${notReviewed.length - 10} more` : ""}.`
            : processed.repeats && findings.length === 0
              ? "No new issues since the last review."
              : null;

  // A push that brings nothing new to say gets no review, only a check run.
  const silent = kind === "incremental" && findings.length === 0 && !partial;
  if (silent) {
    reviewsRepo.update(review.id, { status: "completed", stage: "done", summary, walkthrough, filesReviewed: reviewable.length, finishedAt: Date.now() });
    pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });
    if (review.checkRunId) {
      await finishCheckRun(gh, r, review.checkRunId, "success", "No new issues", `${summary ?? ""}\n\n[Open in PR Guard](${reviewUrl(review.id)})`);
    }
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    return;
  }

  const bodyFor = (items: Finding[]) =>
    reviewBody({
      summary,
      walkthrough,
      kind,
      range,
      findings: items,
      skipped,
      notReviewed,
      filesReviewed: reviewable.length - notReviewed.length,
      note,
      reviewUrl: reviewUrl(review.id),
      reviewed: deep,
    });

  // A retry after a crash must not post twice: reuse a review already on GitHub for this run.
  const current = reviewsRepo.get(review.id)!;
  let posted: { id: number; url: string } | null = current.githubReviewId
    ? { id: current.githubReviewId, url: current.githubReviewUrl ?? "" }
    : ctx.job.attempts > 1
      ? await findPostedReview(gh, r, pr.number, `/reviews/${review.id})`)
      : null;
  const alreadyPosted = posted !== null;
  if (!posted) {
    try {
      posted = await postReview(gh, r, pr.number, review.headSha, bodyFor(findings), toComments(findings));
    } catch (err) {
      if ((err as { status?: number }).status !== 422) throw err;
      log.warn({ review: review.id, err: errMessage(err) }, "line comments rejected, posting findings in the body");
      findings = withInlineInBody(findings);
      posted = await postReview(gh, r, pr.number, review.headSha, bodyFor(findings), []);
    }
    reviewsRepo.update(review.id, { githubReviewId: posted.id, githubReviewUrl: posted.url });
  }
  if (!alreadyPosted || findingsRepo.listForReview(review.id).length === 0) {
    findingsRepo.insertMany({ reviewId: review.id, pullRequestId: pr.id, repositoryId: run.repo.id }, findings);
  }

  reviewsRepo.update(review.id, {
    status: "completed",
    stage: "done",
    summary,
    walkthrough,
    filesReviewed: reviewable.length - notReviewed.length,
    finishedAt: Date.now(),
  });
  pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });

  const check = checkTitle(findings, deep);
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

  // Poll for cancellation so in-flight model calls stop as soon as a newer push arrives.
  const abort = new AbortController();
  const watch = setInterval(() => {
    try {
      ctx.checkCancelled();
    } catch {
      abort.abort();
    }
  }, 2000);

  try {
    await pipeline({ review, pr, repo, gh, r, ctx, signal: abort.signal });
    reviewLog.info({ ms: Date.now() - started }, "review completed");
  } catch (err) {
    if (abort.signal.aborted && !(err instanceof CancelledError)) err = new CancelledError();
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
  } finally {
    clearInterval(watch);
  }
}

registerJob("review_pr", runReview);
