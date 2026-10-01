import { config } from "../config.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { errMessage, log } from "../log.ts";
import { CancelledError, type JobContext } from "../queue/worker.ts";
import { packChunks, type FileDiff } from "./diff.ts";
import type { RawFinding } from "./findings.ts";
import { fileKind, KIND_PRIORITY } from "./noise.ts";
import { reviewChunk } from "./reviewing.ts";
import { applies, type ModelReviewer } from "./reviewers/index.ts";

const REVIEW_PARALLELISM = 4;

/** Runs `fn` over items with at most `limit` in flight; the first error stops new work and is rethrown. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
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

export type ReviewerInput = {
  reviewers: ModelReviewer[];
  /** Code files of this review (reviewable, not docs). */
  files: FileDiff[];
  /** Path to reviewer ids chosen by triage; a path missing here goes to every applicable reviewer. */
  routes?: Map<string, string[]>;
  focus?: Map<string, Set<number>>;
  contextFor: (reviewer: ModelReviewer) => string;
  snapshot: string | null;
  /** Tokens already spent by an earlier attempt, not counted against this attempt's budget. */
  baseline: number;
  ctx: JobContext;
  meta: { reviewId: number; repositoryId: number; signal?: AbortSignal };
};

export type ReviewerStat = { id: string; files: number; chunks: number; findings: number; failed: number; skipped: number };

export type ReviewerOutcome = {
  raw: RawFinding[];
  failedChunks: number;
  notReviewed: string[];
  budgetHit: boolean;
  stats: ReviewerStat[];
};

/** The files one reviewer sees: those it applies to, narrowed by triage when triage routed the file. */
export function filesFor(reviewer: ModelReviewer, files: FileDiff[], routes?: Map<string, string[]>): FileDiff[] {
  return files.filter((f) => applies(reviewer, f.path) && (routes?.get(f.path)?.includes(reviewer.id) ?? true));
}

/**
 * Each model reviewer reviews its own files, packed into its own chunks. Tasks run a few at a time
 * within the review's token budget; a task that would exceed it is skipped and its files reported.
 */
export async function runReviewers(input: ReviewerInput): Promise<ReviewerOutcome> {
  const { ctx, snapshot, focus, meta } = input;
  const ordered = [...input.files].sort(
    (a, b) => KIND_PRIORITY[fileKind(a.path)] - KIND_PRIORITY[fileKind(b.path)] || a.path.localeCompare(b.path),
  );
  const allPaths = [...new Set(ordered.map((f) => f.path))];

  const stats = new Map<string, ReviewerStat>();
  const tasks = input.reviewers.flatMap((reviewer, order) => {
    const mine = filesFor(reviewer, ordered, input.routes);
    const packed = packChunks(mine, { chunkTokens: config.review.chunkTokens, maxChunks: config.review.maxChunks, focus });
    stats.set(reviewer.id, { id: reviewer.id, files: mine.length, chunks: packed.chunks.length, findings: 0, failed: 0, skipped: 0 });
    return packed.chunks.map((chunk, index) => ({ reviewer, order, chunk: chunk.files, index, tokens: chunk.tokens, chunkCount: packed.chunks.length }));
  });
  // Earlier chunks first, and within a chunk the reviewers in registry order, so a tight budget cuts
  // the least important work.
  tasks.sort((a, b) => a.index - b.index || a.order - b.order);

  const covered = new Set<string>();
  const needed = new Set(input.reviewers.flatMap((r) => filesFor(r, ordered, input.routes).map((f) => f.path)));
  let raw: RawFinding[] = [];
  let failedChunks = 0;
  let budgetHit = false;
  let reserved = 0;

  await runPool(tasks, REVIEW_PARALLELISM, async (task) => {
    ctx.checkCancelled();
    const stat = stats.get(task.reviewer.id)!;
    const spent = reviewsRepo.get(meta.reviewId)!;
    const steps = task.reviewer.tools && snapshot ? (task.reviewer.maxSteps ?? 4) : 1;
    const estimate = (task.tokens + 2500) * steps;
    if (spent.tokensIn + spent.tokensOut - input.baseline + reserved + estimate > config.review.tokenBudget) {
      budgetHit = true;
      stat.skipped++;
      return;
    }
    reserved += estimate;
    for (const f of task.chunk) covered.add(f.path);
    const inChunk = new Set(task.chunk.map((f) => f.path));
    const otherFiles = allPaths.filter((p) => !inChunk.has(p)).slice(0, 60);
    log.debug({ review: meta.reviewId, reviewer: task.reviewer.id, files: [...inChunk] }, "reviewer task");
    const found = await reviewChunk({
      task,
      chunkCount: task.chunkCount,
      otherFiles,
      context: input.contextFor(task.reviewer),
      snapshot,
      focus,
      meta,
    })
      .catch((err) => {
        if (err instanceof CancelledError) throw err;
        log.warn({ review: meta.reviewId, reviewer: task.reviewer.id, err: errMessage(err) }, "reviewer failed");
        return null;
      })
      .finally(() => {
        reserved -= estimate;
      });
    if (found) {
      raw = raw.concat(found);
      stat.findings += found.length;
    } else {
      failedChunks++;
      stat.failed++;
    }
  });

  const notReviewed = [...needed].filter((p) => !covered.has(p));
  log.info({ review: meta.reviewId, tasks: tasks.length, notReviewed: notReviewed.length }, "reviewers finished");
  return { raw, failedChunks, notReviewed, budgetHit, stats: [...stats.values()] };
}
