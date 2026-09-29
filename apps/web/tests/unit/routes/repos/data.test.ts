// @vitest-environment node
// The server view models over the fixture corpus: six acme repositories, their
// reviewed PRs plus the synthesised open ones, and a PR's real latest run.
import { describe, expect, it, vi } from 'vitest';

// Next implements `import "server-only"` in its compiler; vitest has no such module.
vi.mock('server-only', () => ({}));
import * as data from '@/components/routes/repos/data.server';

describe('repository view models', () => {
  it('covers the six corpus repositories with their languages', () => {
    const repos = data.fixtureRepoSummaries();
    expect(repos.map((r) => r.name).sort()).toEqual(['checkout-service', 'identity-gateway', 'infra-terraform', 'ledger', 'notifications', 'web-storefront']);
    const byName = Object.fromEntries(repos.map((r) => [r.name, r]));
    expect(byName['checkout-service']!.language).toBe('python');
    expect(byName['web-storefront']!.language).toBe('typescript');
    expect(byName['infra-terraform']!.language).toBe('hcl');
    expect(repos.reduce((n, r) => n + r.provenBugs, 0)).toBe(26);
    expect(repos.every((r) => r.weekly.length === 6 && r.kind === 'fixture')).toBe(true);
  });

  it('finds a corpus repository in any casing', () => {
    expect(data.findFixtureRepo('ACME', 'Checkout-Service')).toEqual({ owner: 'acme', name: 'checkout-service' });
    expect(data.findFixtureRepo('vercel', 'next.js')).toBeNull();
  });

  it('lists the synthesised open PRs above the newest reviewed one, then every reviewed PR', () => {
    const ref = { owner: 'acme', name: 'checkout-service' };
    const rows = data.fixturePulls(ref);
    const open = rows.filter((r) => !r.review);
    const reviewed = rows.filter((r) => r.review);
    expect(reviewed).toHaveLength(12);
    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(open.every((r) => r.number > 4821 && r.kind === 'fixture')).toBe(true);
    const demo = rows.find((r) => r.number === 4821)!;
    expect(demo.review).toMatchObject({ gate: 'failure', status: 'succeeded', published: 3, proven: 1 });
    expect(demo.state).toBe('open');
    expect(demo.headSha.startsWith('9c2d4b1')).toBe(true);
  });

  it('names the open PRs held by the gate', () => {
    const blocked = data.blockedPulls();
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]).toMatchObject({ repo: { owner: 'acme', name: 'checkout-service' }, number: 4821 });
  });
});

describe('one pull request', () => {
  it('opens the demo PR on its real latest run, bucketed the way the page shows it', () => {
    const pr = data.fixturePull({ owner: 'acme', name: 'checkout-service' }, 4821);
    expect(pr.result).not.toBeNull();
    const r = pr.result!;
    expect(r.reviewId).toBe('4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41');
    expect(r.gate).toBe('failure');
    expect(r.counts).toEqual({ raised: 12, dropped: 7, suppressed: 1, refuted: 1, advisory: 2, proven: 1, blocking: 1, inconclusive: 1 });
    expect(r.excluded).toEqual([['uv.lock', 'lockfile']]);
    expect(r.findings.every((f) => f.fixture)).toBe(true);
    expect(pr.history.map((h) => h.status)).toContain('cancelled');
  });

  it('gives any other number a neutral placeholder: no borrowed title, author or diff', () => {
    const pr = data.fixturePull({ owner: 'acme', name: 'checkout-service' }, 99999);
    expect(pr.result).toBeNull();
    expect(pr.meta).toMatchObject({ number: 99999, title: 'Pull request #99999', author: '', files: 0, origin: 'placeholder' });
  });

  it('marks demo open PRs as such, written for their own repository', () => {
    const open = data.fixturePulls({ owner: 'acme', name: 'checkout-service' }).filter((r) => !r.review);
    expect(open.every((r) => r.origin === 'demo')).toBe(true);
    expect(open.some((r) => /ledger|payout/i.test(r.title))).toBe(false);
  });
});

describe('simulation inputs', () => {
  it('replays the recorded run at its time scale', () => {
    const t = data.stageTiming();
    expect(t.map((s) => s.key)).toEqual(['ingest', 'context', 'specialists', 'coordinator', 'severity', 'identity', 'proof', 'delivery', 'finalise']);
    expect(t.find((s) => s.key === 'ingest')!.durationMs).toBe(920);
  });

  it('borrows only from the same repository (then the same language), with evidence for the sheet', () => {
    const checkout = data.simulationPool({ owner: 'acme', name: 'checkout-service' });
    const files = new Set(data.fixturePulls({ owner: 'acme', name: 'checkout-service' }).length ? checkout.map((f) => f.file.split('/')[0]) : []);
    expect(checkout.length).toBeGreaterThan(0);
    expect(checkout.some((f) => /sso|saml|ledger/i.test(f.file))).toBe(false);
    expect([...files].every((d) => ['app', 'tests', 'migrations', ''].includes(d!))).toBe(true);
    expect(checkout.every((f) => f.language === 'python' && f.body.length <= 220 && f.evidence)).toBe(true);
    expect(checkout.find((f) => f.proof === 'proven')!.evidence!.testExcerpt).toMatch(/def test_/);
  });

  it('never simulates proof where the repository has none to borrow', () => {
    const tf = data.fixtureContext({ owner: 'acme', name: 'infra-terraform' });
    expect(tf.caps?.proven).toBe(false);
    const checkout = data.fixtureContext({ owner: 'acme', name: 'checkout-service' });
    expect(checkout.caps).toMatchObject({ proven: true, refuted: true });
    expect(checkout.titles?.length).toBeGreaterThan(0);
  });

  it('knows the one run with a recorded replay', () => {
    expect(data.demoReviewId()).toBe('4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41');
  });
});
