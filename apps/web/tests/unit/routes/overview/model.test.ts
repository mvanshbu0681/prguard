// @vitest-environment node
// /overview's view model, built from the real fixture corpus: every number the
// page prints must agree with the accuracy report, the cost summary and /repos,
// and the noise filter must nest exactly.
import { describe, expect, it, vi } from 'vitest';

// Next implements `import "server-only"` in its compiler; vitest has no such module.
vi.mock('server-only', () => ({}));
import { fixtureRepoSummaries } from '@/components/routes/repos/data.server';
import { sortRepos } from '@/components/routes/overview/Repos';
import accuracy from '@fixtures/accuracy/report.json';
import series from '@fixtures/accuracy/series.json';
import audit from '@fixtures/audit/events.json';
import cost from '@fixtures/cost/summary.json';
import findingsFile from '@fixtures/findings/index.json';
import manifest from '@fixtures/manifest.json';
import reviews from '@fixtures/reviews/index.json';
import type { Finding, ReviewListItem } from '@/lib/api-types';
import { CORPUS_NOW } from '@/components/dash/format';
import {
  WINDOW_KEYS,
  attentionRows,
  buildOverviewModel,
  currentRunByPr,
  quantile,
  recentRuns,
  topFindingByReview,
  windowSince,
} from '@/components/routes/overview/model';

const runs = reviews.items as unknown as ReviewListItem[];
const findings = findingsFile.items as unknown as Finding[];

const model = buildOverviewModel({
  now: CORPUS_NOW,
  runs,
  findings,
  weekly: series.weekly,
  stages: cost.per_stage,
  cache: cost.cache_hit,
  overrides: audit.items.filter((e) => e.event_type === 'override.break_glass').map((e) => e.created_at),
  provenFindingId: manifest.ids.proven_finding_id,
});
const all = model.windows.all;

describe('quantile / windowSince', () => {
  it('interpolates linearly between ranks (numpy default)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBeNull();
  });
  it('windows are measured back from the corpus now', () => {
    expect(windowSince('7d', CORPUS_NOW)).toBe(CORPUS_NOW - 7 * 86_400_000);
    expect(windowSince('30d', CORPUS_NOW)).toBe(CORPUS_NOW - 30 * 86_400_000);
    expect(windowSince('all', CORPUS_NOW)).toBeNull();
  });
});

describe('proof and the noise filter (all time)', () => {
  it('matches the accuracy report', () => {
    expect(all.proof).toEqual({ proven: accuracy.proof.proven, refuted: accuracy.proof.disproven, attempted: accuracy.proof.attempted });
    expect(all.funnel.raised).toBe(accuracy.findings.proposed);
    expect(all.funnel.dropped).toBe(accuracy.findings.dropped_by_coordinator);
    expect(all.funnel.published).toBe(accuracy.findings.published);
    expect(all.funnel.suppressed).toBe(accuracy.findings.suppressed);
  });

  it('nests exactly: kept − suppressed − refuted − unresolved = published, in every window', () => {
    for (const key of WINDOW_KEYS) {
      const f = model.windows[key].funnel;
      expect(f.kept).toBe(f.raised - f.dropped);
      expect(f.kept - f.suppressed - f.refuted - f.unresolved).toBe(f.published);
      expect(f.proven + f.advisory).toBe(f.published);
      expect(f.proven + f.provenSuppressed).toBe(model.windows[key].proof.proven);
    }
  });

  it('reads the corpus as 246 → 124 → 89 → 25 (+1 proven, then suppressed)', () => {
    expect(all.funnel).toMatchObject({ raised: 246, kept: 124, published: 89, proven: 25, provenSuppressed: 1, blocking: 15, advisory: 64 });
  });

  it('narrower windows are subsets', () => {
    const w7 = model.windows['7d'];
    const w30 = model.windows['30d'];
    expect(w7.funnel.raised).toBeLessThanOrEqual(w30.funnel.raised);
    expect(w30.funnel.raised).toBeLessThanOrEqual(all.funnel.raised);
    expect(w7.proof.proven).toBeLessThanOrEqual(all.proof.proven);
  });
});

describe('the merge gate', () => {
  it('every held PR is either fixed or still blocked, and every block was proven', () => {
    expect(all.gate.held).toBe(all.gate.fixed + all.gate.stillBlocked);
    expect(all.gate.heldFixed).toHaveLength(all.gate.held);
    expect(all.gate.blockingProven).toBe(all.gate.blockingFindings);
    expect(all.gate.blockedRuns).toBe(accuracy.gate.runs_red);
    expect(all.gate.overrides).toBe(accuracy.gate.break_glass_overrides);
  });

  it('current state skips a cancelled (superseded) run', () => {
    const current = currentRunByPr(runs);
    const demo = current.get(`${manifest.ids.repository.owner}/${manifest.ids.repository.name}#${manifest.ids.pr_number}`);
    expect(demo?.review_id).toBe(manifest.ids.demo_review_id);
    expect([...current.values()].filter((r) => r.gate_conclusion === 'failure')).toHaveLength(all.gate.stillBlocked);
  });
});

describe('speed, spend, signal', () => {
  it('median review time and cost agree with the report and the cost summary', () => {
    expect(all.speed.medianS).toBeCloseTo(accuracy.runs.median_duration_seconds, 3);
    expect(all.speed.costP50).toBeCloseTo(cost.cost_p50_usd, 4);
    expect(all.speed.costP95).toBeCloseTo(cost.cost_p95_usd, 2);
    expect(all.speed.costHist.map((b) => b.runs)).toEqual(cost.cost_histogram.map((b) => b.runs));
  });

  it('findings per review matches the report', () => {
    expect(all.perReview.mean).toBeCloseTo(accuracy.findings.per_review_published_mean, 3);
    expect(all.perReview.hist.reduce((a, b) => a + b, 0)).toBe(runs.length);
  });

  it('the cache ratio is cached / all input tokens', () => {
    const read = cost.cache_hit.reduce((a, d) => a + d.cache_read_tokens, 0);
    const input = cost.cache_hit.reduce((a, d) => a + d.input_tokens, 0);
    expect(all.cache.ratio).toBeCloseTo(read / (read + input), 6);
    expect(all.cache.days).toBe(cost.cache_hit.length);
  });

  it('spend covers every review; the median cost only completed ones', () => {
    expect(all.speed.reviews).toBe(manifest.counts.runs);
    expect(all.speed.costN).toBe(manifest.counts.runs_by_status.succeeded);
  });

  it('the last corpus week is marked partial', () => {
    expect(model.weekly.at(-1)?.partial).toBe(true);
    expect(model.weekly.slice(0, -1).every((w) => !w.partial)).toBe(true);
    expect(model.weekly.reduce((a, w) => a + w.total, 0)).toBe(all.funnel.kept);
  });
});

describe('repositories (read from /repos, so both pages agree)', () => {
  const repos = fixtureRepoSummaries();

  it('one card per repo; blocked PRs and proven bugs add up to the overview totals', () => {
    expect(repos).toHaveLength(manifest.counts.repositories);
    expect(repos.reduce((a, r) => a + r.blockedOpen, 0)).toBe(all.gate.stillBlocked);
    expect(repos.reduce((a, r) => a + r.provenBugs, 0)).toBe(accuracy.proof.proven);
  });

  it('repos holding a blocked PR sort first', () => {
    const blocked = sortRepos(repos).map((r) => r.blockedOpen);
    expect([...blocked].sort((a, b) => b - a)).toEqual(blocked);
  });
});

describe('needs attention', () => {
  const top = topFindingByReview(findings);

  it('lists every currently blocked PR with the finding that holds it', () => {
    const rows = attentionRows(runs, top);
    expect(rows).toHaveLength(all.gate.stillBlocked);
    expect(rows.every((r) => r.kind === 'blocked')).toBe(true);
    expect(rows[0].run.review_id).toBe(manifest.ids.demo_review_id);
    expect(rows[0].finding?.id).toBe(manifest.ids.proven_finding_id);
    expect(rows.every((r) => r.finding?.blocking && r.finding.proof === 'proven')).toBe(true);
  });

  it('a review in flight comes first', () => {
    const live: ReviewListItem = { ...runs[5], review_id: 'live', status: 'running', gate_conclusion: null, created_at: '2026-09-23T11:59:00Z' };
    const rows = attentionRows([...runs, live], top);
    expect(rows[0]).toMatchObject({ kind: 'running', finding: null });
    expect(rows[0].run.review_id).toBe('live');
  });

  it('the activity timeline is newest first', () => {
    const recent = recentRuns(runs, 5);
    expect(recent).toHaveLength(5);
    for (let i = 1; i < recent.length; i++) expect(Date.parse(recent[i - 1].created_at)).toBeGreaterThanOrEqual(Date.parse(recent[i].created_at));
  });
});
