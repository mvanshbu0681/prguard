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
  createCompletedCheckRun,
  type CheckConclusion,
  type PrFile,
  type Repo,
} from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError, FatalError, registerJob, type JobContext } from "../queue/worker.ts";
import { queueBrief } from "../brief/index-repo.ts";
import { codeTerms, codify } from "./codify.ts";
import { flowMermaid } from "./flow.ts";
import { buildContext, teamRules } from "./context.ts";
import { config } from "../config.ts";
import { addedLines, toFileDiffs, windowHunks, type FileDiff } from "./diff.ts";
import { filesFor, runReviewers } from "./engine.ts";
import { hasTestFiles } from "./tools.ts";
import { cancelReason, closeReview, failReview, reviewUrl } from "./lifecycle.ts";
import * as findingsRepo from "../db/repos/findings.ts";
import { getSnapshot } from "../github/snapshot.ts";
import { processFindings, type RawFinding } from "./findings.ts";
import { classify, fileKind } from "./noise.ts";
import { checkSummary, checkTitle, reviewBody, toComments, withInlineInBody, type BodyInput } from "./publish.ts";
import { enabledPlugins, modelReviewers } from "./reviewers/index.ts";
import { summarize } from "./summarize.ts";
import type { Finding } from "./types.ts";

function describeSkipped(skipped: { path: string; reason: string }[]): string {
  const byReason = new Map<string, string[]>();
  for (const s of skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.path]);
  const label: Record<string, string> = {
    lockfile: "lock files",
    generated: "generated files",
    binary: "binary files",
    deleted: "deleted files",
    "diff too large": "files too large to diff",
    "no changes": "renamed files",
    "only deletions": "files with only removed lines",
  };
  const parts = [...byReason].map(([reason, paths]) => {
    const shown = paths.slice(0, 5).map((p) => `\`${p}\``).join(", ");
    return `${label[reason] ?? reason} (${shown}${paths.length > 5 ? ` and ${paths.length - 5} more` : ""})`;
  });
  return `This pull request changes only ${parts.join("; ")}.`;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "nit"];

/** Test gap reports one finding per review: its most severe, most confident one. */
function oneTestGap(raw: RawFinding[]): RawFinding[] {
  const gaps = raw.filter((f) => f.reviewer === "tests");
  if (gaps.length <= 1) return raw;
  const rank = (f: RawFinding) => {
    const i = SEVERITY_ORDER.indexOf(f.severity.toLowerCase());
    return (i < 0 ? 2 : i) - (f.confidence ?? 0.7);
  };
  const keep = [...gaps].sort((a, b) => rank(a) - rank(b))[0];
  return raw.filter((f) => f.reviewer !== "tests" || f === keep);
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

/** Completes the review's check run, or creates a completed one when it has none (a takeover). */
async function completeCheck(gh: GitHub, r: Repo, review: Review, conclusion: CheckConclusion, title: string, summary: string): Promise<void> {
  if (review.checkRunId) await finishCheckRun(gh, r, review.checkRunId, conclusion, title, summary);
  else await createCompletedCheckRun(gh, r, review.headSha, reviewUrl(review.id), conclusion, title, summary);
}

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
  const { gh, r, ctx } = run;
  let { pr, review } = run;

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
  if (pr.state !== "open" || pr.draft) throw new CancelledError();

  // The PR moved on since this review was queued. Webhooks can arrive out of order, so the review
  // queued for the newest push may already be cancelled: unless another open review covers the live
  // head, this one takes it over instead of leaving the newest push unreviewed.
  if (live.head.sha !== review.headSha) {
    const openForHead = reviewsRepo.listOpenForPull(pr.id).some((o) => o.id !== review.id && o.headSha === live.head.sha);
    if (openForHead) throw new CancelledError();
    if (pr.lastReviewedSha === live.head.sha) {
      // A stale event for a head that is already reviewed: nothing else will clear the 👀 it added.
      if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
      throw new CancelledError();
    }
    if (review.checkRunId) {
      await finishCheckRun(gh, r, review.checkRunId, "cancelled", "Superseded", "A newer push is being reviewed.");
    }
    // No check run yet: one is created when this review publishes, so a takeover that is itself
    // superseded leaves nothing behind on the newer commit.
    reviewsRepo.update(review.id, { headSha: live.head.sha, baseSha: live.base.sha, checkRunId: null });
    review = reviewsRepo.get(review.id)!;
    log.info({ review: review.id, head: live.head.sha }, "review moved to the latest push");
  }

  const files: FileDiff[] = toFileDiffs(await listFiles(gh, r, pr.number));
  const scope = await resolveScope({ ...run, review }, pr, files);
  const { kind, focus, range } = scope;
  const { reviewable, skipped, docsOnly } = classify(scope.files);
  const anchorFiles = classify(files).reviewable;
  reviewsRepo.update(review.id, { kind, baseSha: live.base.sha, filesSkipped: skipped });
  ctx.checkCancelled();

  if (kind === "incremental" && reviewable.length === 0) {
    reviewsRepo.update(review.id, {
      status: "completed",
      stage: "done",
      note: "No new changes to review since the last review.",
      reviewed: false,
      finishedAt: Date.now(),
    });
    pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });
    await completeCheck(gh, r, review, "success", "No new changes", "Nothing new to review since the last review.");
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    return;
  }

  if (repoNow.briefStatus === "none") queueBrief(repoNow.id);
  const baseContext = buildContext(pr, repoNow);
  const rulesContext = buildContext(pr, repoNow, { rules: true });
  const meta = { reviewId: review.id, repositoryId: run.repo.id, signal: run.signal };

  const plugins = enabledPlugins(run.repo.disabledReviewers);
  // Team rules has nothing to enforce without rules or a brief.
  const hasRules = Boolean(teamRules(repoNow) || repoNow.brief?.trim());
  const models = modelReviewers(plugins).filter((r) => !r.needs?.rules || hasRules);
  const codeFiles = docsOnly ? [] : reviewable.filter((f) => fileKind(f.path) !== "docs");
  const deep = models.some((r) => filesFor(r, codeFiles).length > 0);

  let summary: string | null = null;
  let walkthrough: { path: string; change: string }[] = [];
  let flow: string | null = null;
  let raw: RawFinding[] = [];
  let failedChunks = 0;
  let notReviewed: string[] = [];
  let budgetHit = false;
  // Usage from an earlier, interrupted attempt does not count against this attempt's budget.
  const baseline = review.tokensIn + review.tokensOut;
  stage(review.id, deep ? "reviewing" : "summarizing");

  // A failed summary must not throw away the findings: the review goes out without one.
  let summaryFailed = false;
  const summaryTask = reviewable.length
    ? summarize({ context: baseContext, files: reviewable, incremental: kind === "incremental", focus, meta })
        .then((s) => {
          summary = s.summary;
          walkthrough = s.walkthrough;
          flow = flowMermaid(s.flow);
        })
        .catch((err) => {
          if (run.signal.aborted) throw err;
          summaryFailed = true;
          log.warn({ review: review.id, err: errMessage(err) }, "summary failed, publishing without it");
        })
    : Promise.resolve();

  const reviewTask = deep
    ? (async () => {
        const snapshot = await getSnapshot(gh, run.repo.id, run.repo.fullName, review.headSha).catch((err) => {
          log.warn({ review: review.id, err: errMessage(err) }, "snapshot unavailable, reviewing without tools");
          return null;
        });
        ctx.checkCancelled();
        // Test gap has nothing to compare against in a repository without tests.
        const testsInRepo = snapshot !== null && hasTestFiles(snapshot);
        const outcome = await runReviewers({
          reviewers: models.filter((r) => !r.needs?.testsInRepo || testsInRepo),
          files: codeFiles,
          focus,
          contextFor: (r) => (r.needs?.rules ? rulesContext : baseContext),
          snapshot,
          baseline,
          ctx,
          meta,
        });
        raw = oneTestGap(outcome.raw);
        failedChunks = outcome.failedChunks;
        notReviewed = outcome.notReviewed;
        budgetHit = outcome.budgetHit;
      })()
    : Promise.resolve();

  await Promise.all([summaryTask, reviewTask]);
  ctx.checkCancelled();

  const previous = findingsRepo.listPostedForPull(pr.id);
  const processed = processFindings(raw, anchorFiles, previous, focus);
  const terms = codeTerms(files);
  let findings: Finding[] = processed.findings.map((f) => ({ ...f, title: codify(f.title, terms), body: codify(f.body, terms) }));
  if (summary) summary = codify(summary, terms);
  walkthrough = walkthrough.map((w) => ({ ...w, change: codify(w.change, terms) }));
  const partial = failedChunks > 0 || notReviewed.length > 0;
  reviewsRepo.update(review.id, { partial, notReviewed });
  if (processed.dropped) log.info({ review: review.id, dropped: processed.dropped }, "findings dropped");

  // Nothing the models could read (lock files, generated or binary files): describe it plainly.
  if (reviewable.length === 0 && skipped.length) summary = describeSkipped(skipped);

  stage(review.id, "publishing");
  const limits = [
    summaryFailed && "The summary could not be written this time.",
    failedChunks > 0 && "Part of this pull request could not be reviewed. Re-run to try again.",
    notReviewed.length > 0 &&
      `Reviewed part of this pull request${budgetHit ? " (review budget reached)" : " (size limit reached)"}. Not reviewed: ${notReviewed
        .slice(0, 10)
        .map((p) => `\`${p}\``)
        .join(", ")}${notReviewed.length > 10 ? ` and ${notReviewed.length - 10} more` : ""}.`,
  ].filter((s): s is string => Boolean(s));
  const note =
    reviewable.length === 0
      ? "Nothing to review: only deleted, binary, generated or lock files changed."
      : docsOnly
        ? "Documentation only, so this is a summary without a code review."
        : !deep
          ? "Reviewers are off for this repository, so this is a summary only."
          : limits.length
            ? limits.join(" ")
            : processed.repeats && findings.length === 0
              ? "No new issues since the last review."
              : null;

  // A push that brings nothing new to say gets no review, only a check run.
  const silent = kind === "incremental" && findings.length === 0 && !partial;
  if (silent) {
    reviewsRepo.update(review.id, {
      status: "completed",
      stage: "done",
      summary,
      walkthrough,
      flow,
      note: "No new issues in these commits.",
      reviewed: deep,
      filesReviewed: reviewable.length,
      finishedAt: Date.now(),
    });
    pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });
    await completeCheck(gh, r, review, "success", "No new issues", `${summary ?? ""}\n\n[Open in PR Guard](${reviewUrl(review.id)})`);
    if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
    return;
  }

  const inputFor = (items: Finding[]): BodyInput => ({
    summary,
    walkthrough,
    flow,
    kind,
    range,
    findings: items,
    skipped,
    notReviewed,
    filesReviewed: reviewable.length - notReviewed.length,
    note,
    reviewUrl: reviewUrl(review.id),
    blobUrl: `https://github.com/${run.repo.fullName}/blob/${review.headSha}`,
    reviewed: deep,
  });
  const bodyFor = (items: Finding[]) => reviewBody(inputFor(items));

  // A retry after a crash must not post twice: reuse a review already on GitHub for this run.
  const current = reviewsRepo.get(review.id)!;
  let posted: { id: number; url: string } | null = current.githubReviewId
    ? { id: current.githubReviewId, url: current.githubReviewUrl ?? "" }
    : ctx.job.attempts > 1
      ? await findPostedReview(gh, r, pr.number, reviewUrl(review.id))
      : null;
  const alreadyPosted = posted !== null;
  if (!posted) {
    try {
      posted = await postReview(gh, r, pr.number, review.headSha, bodyFor(findings), toComments(findings, reviewUrl(review.id)));
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
    flow,
    note,
    reviewed: deep,
    filesReviewed: reviewable.length - notReviewed.length,
    finishedAt: Date.now(),
  });
  pullsRepo.update(pr.id, { lastReviewedSha: review.headSha });

  const check = checkTitle(findings, deep);
  await completeCheck(gh, r, review, check.conclusion, check.title, checkSummary(inputFor(findings)));
  if (review.reactionId) await removeReaction(gh, r, pr.number, review.reactionId);
}

async function runReview(payload: Record<string, unknown>, ctx: JobContext): Promise<void> {
  const reviewId = Number(payload.reviewId);
  const review = reviewsRepo.get(reviewId);
  if (!review || !["queued", "running"].includes(review.status)) return;
  const pr = pullsRepo.get(review.pullRequestId)!;
  const repo = repositoriesRepo.get(review.repositoryId)!;
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
    const gh = await installationClient(repo.installationId);
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
    await failReview(reviewId);
    throw new FatalError(errMessage(err));
  } finally {
    clearInterval(watch);
    // Anything still running for this review (e.g. reviewer calls after a failed summary) stops here.
    abort.abort();
  }
}

registerJob("review_pr", runReview, (payload) => failReview(Number(payload.reviewId)));
