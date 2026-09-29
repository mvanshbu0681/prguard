// The review history's logic: filters, the day-grouped timeline, supersession,
// the summary band and the per-row count line — against hand-built rows and the
// real 76-run corpus (public/fixtures/reviews/index.json).
import { describe, expect, it } from 'vitest';
import corpus from '@fixtures/reviews/index.json';
import accuracy from '@fixtures/accuracy/report.json';
import type { ReviewListItem } from '@/lib/api-types';
import {
  countBits,
  filterRuns,
  groupByDay,
  isFiltered,
  matchesQuery,
  median,
  medianDuration,
  NO_FILTERS,
  outcomeOf,
  summarize,
  takeRuns,
  threadsOf,
  timeOfDay,
} from '@/components/routes/runs-list/model';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const items = (corpus as { items: ReviewListItem[] }).items;

function run(over: Partial<ReviewListItem> & { review_id: string }): ReviewListItem {
  return {
    status: 'succeeded',
    trigger: 'webhook',
    repository: { owner: 'acme', name: 'checkout-service' },
    pull_request: { number: 1, title: 'A change', author: 'mhollis' },
    risk_tier: 'full',
    gate_conclusion: 'success',
    counts: { proposed: 3, published: 2, suppressed: 0, dropped: 1, disproven: 0, blocking: 0 },
    cost_usd_estimate: 1,
    duration_seconds: 30,
    created_at: '2026-09-23T10:00:00Z',
    finished_at: '2026-09-23T10:00:30Z',
    ...over,
  };
}

describe('filterRuns', () => {
  it('filters by gate, repository, trigger and search together', () => {
    const blocked = filterRuns(items, { ...NO_FILTERS, gate: 'blocked' });
    expect(blocked).toHaveLength(14);
    expect(blocked.every((r) => r.gate_conclusion === 'failure')).toBe(true);

    const ledgerReruns = filterRuns(items, { gate: 'all', repo: 'acme/ledger', trigger: 'rerun', q: '' });
    expect(ledgerReruns.map((r) => r.pull_request.number)).toEqual([333]);
  });

  it('counts a verdict only for a finished run, so the gate pills agree with the band', () => {
    const s = summarize(items, NOW);
    expect(filterRuns(items, { ...NO_FILTERS, gate: 'clear' })).toHaveLength(s.gate.clear);
    expect(filterRuns(items, { ...NO_FILTERS, gate: 'neutral' })).toHaveLength(s.gate.neutral);
  });

  it('ignoreGate keeps every gate so the summary can act as the legend', () => {
    const f = { ...NO_FILTERS, gate: 'blocked' as const, repo: 'acme/checkout-service' };
    const scoped = filterRuns(items, f, { ignoreGate: true });
    expect(scoped).toHaveLength(15);
    expect(filterRuns(items, f).length).toBeLessThan(scoped.length);
  });

  it('never counts a live run as blocked or clear, and Running finds it', () => {
    const live = run({ review_id: 'l', status: 'running', gate_conclusion: 'failure' });
    expect(filterRuns([live], { ...NO_FILTERS, gate: 'blocked' })).toHaveLength(0);
    expect(filterRuns([live], { ...NO_FILTERS, gate: 'running' })).toHaveLength(1);
  });

  it('isFiltered is false only for the defaults', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: '  ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, trigger: 'api' })).toBe(true);
  });
});

describe('matchesQuery', () => {
  const r = run({ review_id: 'q', pull_request: { number: 4821, title: 'Resolve account currency at charge time', author: 'mhollis' } });
  it('matches a PR number with or without #, by prefix', () => {
    expect(matchesQuery(r, '4821')).toBe(true);
    expect(matchesQuery(r, '#48')).toBe(true);
    expect(matchesQuery(r, '#999')).toBe(false);
  });
  it('matches every word of the title, author or repository, case-insensitively', () => {
    expect(matchesQuery(r, 'CURRENCY charge')).toBe(true);
    expect(matchesQuery(r, 'mhollis checkout')).toBe(true);
    expect(matchesQuery(r, 'currency refund')).toBe(false);
  });
});

describe('threadsOf / outcomeOf', () => {
  it('marks a cancelled run with a newer run on the same PR as superseded', () => {
    const threads = threadsOf(items);
    const t = threads.get('9beb6766-763b-46f5-b429-6858bc628aca');
    expect(t?.superseded).toBe(true);
    expect(t?.next?.review_id).toBe('4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41');
    const demo = items.find((r) => r.review_id === '4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41')!;
    expect(outcomeOf(demo, threads.get(demo.review_id))).toBe('blocked');
    expect(threads.get(demo.review_id)?.prev?.review_id).toBe('9beb6766-763b-46f5-b429-6858bc628aca');
  });

  it('keeps a cancelled run without a successor as cancelled, and reads failed / running / neutral', () => {
    expect(outcomeOf(run({ review_id: 'c', status: 'cancelled', gate_conclusion: null }), { next: null, prev: null, superseded: false })).toBe('cancelled');
    expect(outcomeOf(run({ review_id: 'f', status: 'failed', gate_conclusion: null }))).toBe('failed');
    expect(outcomeOf(run({ review_id: 'q', status: 'queued' }))).toBe('running');
    expect(outcomeOf(run({ review_id: 'n', gate_conclusion: 'neutral' }))).toBe('neutral');
  });
});

describe('groupByDay', () => {
  it('groups the corpus by UTC day, newest first, relative to the corpus clock', () => {
    const groups = groupByDay(items, NOW);
    expect(groups[0]).toMatchObject({ key: '2026-09-23', title: 'Today' });
    expect(groups[0].sub).toBe('Wed 23 Sep');
    expect(groups[1]).toMatchObject({ key: '2026-09-22', title: 'Yesterday' });
    expect(groups[2].title).toBe('Mon 21 Sep');
    expect(groups[2].sub).toBe('2 days ago');
    expect(groups.reduce((n, g) => n + g.runs.length, 0)).toBe(76);
    // Today: the demo run (11:46) above the run it superseded (11:45).
    expect(groups[0].runs.map((r) => timeOfDay(r.created_at))).toEqual(['11:46', '11:45']);
    expect(groups[0].blocked).toBe(1);
  });

  it('puts live runs first under "In progress", whatever their clock says', () => {
    const groups = groupByDay([run({ review_id: 'a' }), run({ review_id: 'b', status: 'running', created_at: '2026-09-28T05:00:00Z' })], NOW);
    expect(groups.map((g) => g.title)).toEqual(['In progress', 'Today']);
  });

  it('takeRuns pages by run count across days', () => {
    const groups = groupByDay(items, NOW);
    const page = takeRuns(groups, 5);
    expect(page.shown).toBe(5);
    expect(page.total).toBe(76);
    expect(page.groups.map((g) => g.runs.length)).toEqual([2, 3]);
  });
});

describe('summarize', () => {
  it('reads the corpus window the way the band prints it', () => {
    const s = summarize(items, NOW);
    expect(s.runs).toBe(76);
    expect(s.pullRequests).toBe(62);
    expect(s.repositories).toBe(6);
    expect(s.gate).toEqual({ blocked: 14, clear: 52, neutral: 5, noVerdict: 5, running: 0 });
    expect(s.days[0].key).toBe('2026-08-19');
    expect(s.days[s.days.length - 1].key).toBe('2026-09-23');
    expect(s.days.reduce((n, d) => n + d.total, 0)).toBe(76);
    expect(s.medianCost).toBeCloseTo(0.9982, 4);
    // The same population as GET /v1/accuracy runs.median_duration_seconds (28.707).
    expect(s.medianDuration).toBeCloseTo(28.707, 3);
  });

  it('median handles empty, odd and even inputs', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('countBits', () => {
  it('leads with what blocks, keeps published even at zero, drops other zeroes', () => {
    const demo = items.find((r) => r.review_id === '4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41')!;
    expect(countBits(demo).map((b) => `${b.n} ${b.label}`)).toEqual(['1 blocking', '3 published', '1 refuted', '1 suppressed', '7 dropped']);
    expect(countBits(run({ review_id: 'z', counts: { proposed: 0, published: 0, suppressed: 0, dropped: 0, disproven: 0, blocking: 0 } })).map((b) => b.label)).toEqual([
      'published',
    ]);
  });

  it('a failed run reports nothing; a cancelled one reports what was raised; a live one what is proposed', () => {
    expect(countBits(run({ review_id: 'f', status: 'failed' }))).toEqual([]);
    expect(countBits(run({ review_id: 'c', status: 'cancelled', counts: { proposed: 6, dropped: 2 } }))[0]).toMatchObject({ key: 'raised', n: 6 });
    expect(countBits(run({ review_id: 'l', status: 'running', counts: { proposed: 4 } }))[0]).toMatchObject({ key: 'proposed', n: 4 });
  });
});

describe('summarize with a pinned window', () => {
  it('keeps the whole window on the time axis for a filtered subset', () => {
    const subset = filterRuns(items, { ...NO_FILTERS, repo: 'acme/identity-gateway' });
    const pinned = summarize(subset, NOW, '2026-08-19');
    expect(pinned.days[0].key).toBe('2026-08-19');
    expect(pinned.days).toHaveLength(summarize(items, NOW).days.length);
    expect(summarize(subset, NOW).days[0].key > '2026-08-19').toBe(true);
  });
});

describe('medianDuration', () => {
  it('matches the accuracy report, so /runs, Overview and Accuracy print one number', () => {
    expect(medianDuration(items)).toBeCloseTo(accuracy.runs.median_duration_seconds, 6);
    expect(medianDuration(items)!.toFixed(1)).toBe('28.7');
  });
  it('leaves live runs out', () => {
    expect(medianDuration([run({ review_id: 'a', duration_seconds: 10 }), run({ review_id: 'b', status: 'running', duration_seconds: 99 })])).toBe(10);
  });
});
