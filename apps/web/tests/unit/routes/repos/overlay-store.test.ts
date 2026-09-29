// The viewer's demo state: which repositories the workspace shows, and how a
// review started in this browser reads as running, then reviewed.
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTimeline, contextFor, DEFAULT_TIMING, DEMO_TITLES, pullKey, syntheticOpenPulls, syntheticOutcome, timelineTotal, type PullRow, type RepoSummary } from '@/components/routes/repos/model';
import { baseRows, baseSummary, overlayRows, summaryFromRows } from '@/components/routes/repos/overlay';
import { REPOS_STORAGE_KEY, reposStore, workspaceRepos, type ReposState } from '@/components/routes/repos/store';

const ACME = ['checkout-service', 'identity-gateway', 'ledger'].map((name) => ({ owner: 'acme', name }));
const state = (over: Partial<ReposState>): ReposState => ({ v: 1, connection: null, imported: [], disabled: [], analyses: {}, ...over });

describe('workspaceRepos', () => {
  it('shows every repository of the connected account, or only the selected ones', () => {
    const all = workspaceRepos(state({ connection: { account: 'acme', kind: 'org', access: 'all', repos: [], connectedAt: '' } }), ACME);
    expect(all.map((w) => w.ref.name)).toEqual(['checkout-service', 'identity-gateway', 'ledger']);
    const some = workspaceRepos(state({ connection: { account: 'acme', kind: 'org', access: 'select', repos: ['ledger'], connectedAt: '' } }), ACME);
    expect(some.map((w) => w.ref.name)).toEqual(['ledger']);
  });

  it('adds imported repositories once, flagged as imported', () => {
    const w = workspaceRepos(
      state({
        connection: { account: 'acme', kind: 'org', access: 'select', repos: ['ledger'], connectedAt: '' },
        imported: [
          { owner: 'ACME', name: 'Ledger', importedAt: '' },
          { owner: 'vercel', name: 'next.js', importedAt: '' },
        ],
      }),
      ACME,
    );
    expect(w).toEqual([
      { ref: { owner: 'acme', name: 'ledger' }, source: 'installed' },
      { ref: { owner: 'vercel', name: 'next.js' }, source: 'imported' },
    ]);
    expect(workspaceRepos(null, ACME)).toEqual([]);
  });
});

describe('reposStore', () => {
  beforeEach(() => reposStore.reset());

  it('persists the connection, imports, switches and reviews to localStorage', () => {
    reposStore.connectDemo();
    reposStore.importRepo({ owner: 'vercel', name: 'next.js' });
    reposStore.importRepo({ owner: 'Vercel', name: 'Next.js' });
    reposStore.setEnabled({ owner: 'acme', name: 'ledger' }, false);
    reposStore.startAnalysis({ owner: 'vercel', name: 'next.js' }, 128, 1000);
    const saved = JSON.parse(localStorage.getItem(REPOS_STORAGE_KEY)!) as ReposState;
    expect(saved.connection).toMatchObject({ account: 'acme', access: 'all' });
    expect(saved.imported).toHaveLength(1);
    expect(saved.disabled).toEqual(['acme/ledger']);
    expect(saved.analyses[pullKey({ owner: 'vercel', name: 'next.js' }, 128)]).toEqual({ startedAt: 1000 });
    reposStore.setEnabled({ owner: 'acme', name: 'ledger' }, true);
    reposStore.disconnect();
    const after = JSON.parse(localStorage.getItem(REPOS_STORAGE_KEY)!) as ReposState;
    expect(after.connection).toBeNull();
    expect(after.disabled).toEqual([]);
  });
});

describe('overlayRows', () => {
  const ref = { owner: 'acme', name: 'ledger' };
  const ctx = contextFor(ref, { kind: 'fixture', language: 'python', authors: ['yuki-t'], defaultBranch: 'main', titles: DEMO_TITLES.ledger });
  const rows: PullRow[] = syntheticOpenPulls(ref, ctx, 347).map((p) => ({ ...p, review: null }));
  const row = rows[0]!;
  const total = timelineTotal(buildTimeline(DEFAULT_TIMING, row.files));
  const analyses = { [pullKey(ref, row.number)]: { startedAt: 10_000 } };

  it('reads as running inside the timeline, then takes the simulated outcome', () => {
    const running = overlayRows(ref, rows, analyses, 10_000 + total / 2, DEFAULT_TIMING);
    expect(running[0]!.review).toMatchObject({ status: 'running', gate: null });
    const done = overlayRows(ref, rows, analyses, 10_000 + total + 1, DEFAULT_TIMING);
    const o = syntheticOutcome(ref, row.number);
    expect(done[0]!.review).toMatchObject({ status: 'succeeded', gate: o.gate, proven: o.proven, published: o.proven + o.advisory, reviewId: null });
    expect(done.slice(1)).toEqual(rows.slice(1));
  });

  it('lists nothing for an imported repository until a PR is pasted, then only that placeholder', () => {
    const imported = { owner: 'vercel', name: 'next.js' };
    expect(baseRows(imported, undefined)).toEqual([]);
    const pasted = baseRows(imported, undefined, { [pullKey(imported, 71234)]: { startedAt: 1 } });
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).toMatchObject({ number: 71234, title: 'Pull request #71234', origin: 'placeholder', review: null });
    expect(baseRows(imported, undefined, { [pullKey({ owner: 'other', name: 'repo' }, 5)]: { startedAt: 1 } })).toEqual([]);
  });

  it('adds a pasted PR in a corpus repository above its rows', () => {
    const withPasted = baseRows(ref, rows, { [pullKey(ref, 99999)]: { startedAt: 1 } }, ctx);
    expect(withPasted[0]).toMatchObject({ number: 99999, origin: 'placeholder' });
    expect(withPasted.slice(1)).toEqual(rows);
  });

  it('keeps the real verdict when a corpus PR is re-run', () => {
    const real: PullRow = { ...row, review: { reviewId: 'r1', status: 'succeeded', gate: 'success', published: 2, proven: 0, at: '2026-09-20T00:00:00Z', durationS: 30 } };
    const out = overlayRows(ref, [real], analyses, 10_000 + total + 1, DEFAULT_TIMING);
    expect(out[0]).toEqual(real);
  });

  it('recomputes the card numbers from the overlaid rows', () => {
    const done = overlayRows(ref, rows, analyses, 10_000 + total + 1, DEFAULT_TIMING);
    const base: RepoSummary = { ...baseSummary(ref, undefined), provenBugs: 0 };
    const s = summaryFromRows(base, done);
    const o = syntheticOutcome(ref, row.number);
    expect(s.reviewedPulls).toBe(1);
    expect(s.lastGate).toBe(o.gate);
    expect(s.provenBugs).toBe(o.proven);
    expect(s.blockedOpen).toBe(o.gate === 'failure' ? 1 : 0);
  });
});
