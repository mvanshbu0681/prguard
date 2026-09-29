// Folding the viewer's simulated reviews (store.ts) into the corpus view
// models, so a PR analysed here reads as reviewed everywhere: its row, its
// repository's card, the "Needs you" list. Pure: `now` comes from the caller's
// clock, which keeps the views in step while a review is still running.
import {
  briefFromOutcome,
  buildTimeline,
  contextFor,
  pullKey,
  slugOf,
  placeholderPull,
  syntheticOpenPulls,
  syntheticOutcome,
  syntheticRepoSummary,
  timelineTotal,
  type PullRow,
  type RepoRef,
  type RepoSummary,
  type StageTimingInput,
  type SyntheticContext,
} from './model';

export type Analyses = Record<string, { startedAt: number }>;

/**
 * The rows a repository starts from: the server's for a corpus repository,
 * synthesised open PRs otherwise — plus any PR analysed here by pasting its
 * link, which is not in either list until then.
 */
export function baseRows(ref: RepoRef, fixtureRows: PullRow[] | undefined, analyses: Analyses = {}, ctx: SyntheticContext = contextFor(ref)): PullRow[] {
  const rows = fixtureRows ?? syntheticOpenPulls(ref, ctx).map((p): PullRow => ({ ...p, review: null }));
  const prefix = `${slugOf(ref).toLowerCase()}#`;
  const extra = Object.keys(analyses)
    .filter((k) => k.startsWith(prefix))
    .map((k) => Number(k.slice(prefix.length)))
    .filter((n) => Number.isSafeInteger(n) && n > 0 && !rows.some((r) => r.number === n))
    .sort((a, b) => b - a)
    .map((n): PullRow => ({ ...placeholderPull(ref, n, ctx), review: null }));
  return extra.length ? [...extra, ...rows] : rows;
}

export function baseSummary(ref: RepoRef, fixture: RepoSummary | undefined): RepoSummary {
  return fixture ?? syntheticRepoSummary(ref);
}

/**
 * Applies the reviews started in this browser. A review still inside its
 * timeline reads as running; a finished one on a PR without a real review
 * takes its simulated outcome. A re-run of a corpus PR keeps the real verdict.
 */
export function overlayRows(ref: RepoRef, rows: PullRow[], analyses: Analyses, now: number, timing: readonly StageTimingInput[], ctx?: SyntheticContext): PullRow[] {
  return rows.map((row) => {
    const rec = analyses[pullKey(ref, row.number)];
    if (!rec) return row;
    const total = timelineTotal(buildTimeline(timing, row.files));
    const endsAt = rec.startedAt + total;
    if (now > 0 && now < endsAt) {
      return { ...row, review: { reviewId: row.review?.reviewId ?? null, status: 'running', gate: null, published: 0, proven: 0, at: new Date(rec.startedAt).toISOString(), durationS: null } };
    }
    if (row.review && row.review.reviewId) return row;
    const outcome = syntheticOutcome(ref, row.number, ctx?.caps);
    return { ...row, review: briefFromOutcome(outcome, new Date(endsAt).toISOString(), total / 1000) };
  });
}

/** A repository's card numbers, recomputed from its (overlaid) rows. */
export function summaryFromRows(base: RepoSummary, rows: PullRow[]): RepoSummary {
  const reviewed = rows.filter((r) => r.review && r.review.status !== 'running');
  const newest = [...reviewed].sort((a, b) => Date.parse(b.review!.at) - Date.parse(a.review!.at))[0];
  const simulatedProven = rows.reduce((n, r) => n + (r.review && !r.review.reviewId ? r.review.proven : 0), 0);
  return {
    ...base,
    reviewedPulls: reviewed.length,
    openPulls: rows.filter((r) => r.state === 'open').length,
    blockedOpen: rows.filter((r) => r.state === 'open' && r.review?.gate === 'failure').length,
    provenBugs: base.provenBugs + simulatedProven,
    lastGate: newest?.review?.gate ?? base.lastGate,
    lastReviewedAt: newest?.review?.at ?? base.lastReviewedAt,
  };
}
