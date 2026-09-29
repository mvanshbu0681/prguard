// The deterministic synthesis behind the demo: the same seed always yields the
// same PRs, the same outcome and the same findings, and the live script is a
// pure function of the timeline.
import { describe, expect, it } from 'vitest';
import {
  buildScript,
  buildTimeline,
  contextFor,
  countFindings,
  DEFAULT_TIMING,
  DEMO_TITLES,
  groupOf,
  rng,
  stageAt,
  syntheticOpenPulls,
  syntheticOutcome,
  syntheticPullByNumber,
  syntheticRepoNames,
  syntheticRepoSummary,
  synthesizeResult,
  timelineTotal,
  type DisplayFinding,
} from '@/components/routes/repos/model';

const ref = { owner: 'vercel', name: 'next.js' };
const ctx = contextFor(ref);

function finding(over: Partial<DisplayFinding>): DisplayFinding {
  return {
    id: 'f',
    fixture: true,
    title: `claim ${over.id ?? 'f'}`,
    body: '',
    specialist: 'bugs',
    file: 'a.py',
    line: 1,
    language: 'python',
    band: 'high',
    score: 0.6,
    proof: 'not_attempted',
    status: 'published',
    blocking: false,
    testFile: null,
    baseLine: null,
    headLine: null,
    ...over,
  };
}

const POOL: DisplayFinding[] = [
  finding({ id: 'p1', proof: 'proven', blocking: true, score: 0.81, band: 'critical', testFile: 'tests/test_repro_a.py', baseLine: '1 passed in 0.4s', headLine: '1 failed in 0.3s' }),
  finding({ id: 'p2', proof: 'proven', blocking: true, score: 0.7, language: 'typescript' }),
  finding({ id: 'd1', proof: 'disproven', status: 'disproven' }),
  finding({ id: 'i1', proof: 'inconclusive' }),
  finding({ id: 'a1', proof: 'not_applicable', specialist: 'quality' }),
  finding({ id: 'a2', proof: 'not_attempted', specialist: 'security' }),
  finding({ id: 'a3', proof: 'not_attempted', specialist: 'tests' }),
  finding({ id: 's1', status: 'suppressed' }),
  ...Array.from({ length: 6 }, (_, i) => finding({ id: `x${i}`, status: 'dropped', score: null, band: null })),
];

describe('seeded randomness', () => {
  it('is a stable stream per seed and differs between seeds', () => {
    const a = rng('seed');
    const b = rng('seed');
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(rng('other')()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('synthetic pull requests', () => {
  const ledger = { owner: 'acme', name: 'ledger' };
  const ledgerCtx = contextFor(ledger, { kind: 'fixture', language: 'python', authors: ['dmitri-k', 'yuki-t'], defaultBranch: 'main', titles: DEMO_TITLES.ledger });

  it('gives an acme demo repository 2–3 open PRs from its own title bank, numbered above the corpus, newest first', () => {
    const one = syntheticOpenPulls(ledger, ledgerCtx, 347);
    expect(syntheticOpenPulls(ledger, ledgerCtx, 347)).toEqual(one);
    expect(one.length).toBeGreaterThanOrEqual(2);
    expect(one.length).toBeLessThanOrEqual(3);
    expect(one.every((p) => p.number > 347 && p.state === 'open' && p.origin === 'demo')).toBe(true);
    expect(one.every((p) => DEMO_TITLES.ledger!.includes(p.title) && ['dmitri-k', 'yuki-t'].includes(p.author))).toBe(true);
    expect([...one].sort((a, b) => b.number - a.number)).toEqual(one);
    expect(new Set(one.map((p) => p.title)).size).toBe(one.length);
    expect(Date.parse(one[0]!.updatedAt)).toBeGreaterThan(Date.parse(one[one.length - 1]!.updatedAt));
  });

  it('looks a demo PR up by number, and gives any other number a neutral placeholder', () => {
    const p = syntheticOpenPulls(ledger, ledgerCtx, 347)[1]!;
    expect(syntheticPullByNumber(ledger, ledgerCtx, p.number, 347)).toEqual(p);
    const other = syntheticPullByNumber(ledger, ledgerCtx, 99999, 347);
    expect(other).toMatchObject({ number: 99999, title: 'Pull request #99999', author: '', headBranch: '', headSha: '', files: 0, origin: 'placeholder' });
  });

  it('invents nothing for a repository or account outside the corpus', () => {
    expect(syntheticOpenPulls(ref, ctx)).toEqual([]);
    expect(syntheticPullByNumber(ref, ctx, 71234)).toMatchObject({ title: 'Pull request #71234', author: '', origin: 'placeholder' });
    expect(ctx.language).toBeNull();
    expect(syntheticRepoSummary(ref)).toMatchObject({ description: null, language: null, visibility: null, defaultBranch: null, openPulls: 0 });
    expect(syntheticRepoNames('octo-org')).toEqual([]);
    expect(syntheticRepoNames('witness-admin')).toEqual([]);
  });
});

describe('the simulated outcome and result', () => {
  it('always accounts for every claim, and only a proven bug fails the gate', () => {
    for (let n = 1; n <= 60; n++) {
      const o = syntheticOutcome(ref, n);
      expect(o.proven + o.refuted + o.advisory + o.suppressed + o.dropped).toBe(o.raised);
      expect(o.gate === 'failure').toBe(o.proven > 0);
      expect(o.blocking).toBe(o.proven);
      if (o.proven === 0) expect(o.gate).toBe(o.inconclusive > 0 ? 'neutral' : 'success');
    }
  });

  it('never simulates an outcome the repository has no findings for', () => {
    const noProof = { proven: false, refuted: false, inconclusive: false, suppressed: false };
    for (let n = 1; n <= 40; n++) {
      const o = syntheticOutcome(ref, n, noProof);
      expect(o).toMatchObject({ proven: 0, refuted: 0, inconclusive: 0, suppressed: 0, gate: 'success' });
    }
  });

  it('is identical across runs, borrows corpus texts under its own ids, and matches its outcome', () => {
    const pull = syntheticPullByNumber(ref, ctx, 128);
    const a = synthesizeResult(ref, pull, POOL, 'typescript');
    const b = synthesizeResult(ref, pull, POOL, 'typescript');
    expect(b).toEqual(a);
    expect(a.findings.every((f) => f.id.startsWith('sim-128-') && !f.fixture)).toBe(true);
    const o = syntheticOutcome(ref, 128);
    expect(a.gate).toBe(o.gate);
    expect(a.findings.filter((f) => groupOf(f) === 'proven').length).toBe(Math.min(o.proven, 2));
    expect(new Set(a.findings.map((f) => f.title)).size).toBe(a.findings.length);
  });
});

describe('counting and grouping real findings', () => {
  it('puts a proven bug under the gate threshold with the advisory comments, but still counts it as proven', () => {
    const fs = [
      finding({ id: '1', proof: 'proven', blocking: true }),
      finding({ id: '2', proof: 'proven', blocking: false }),
      finding({ id: '3', proof: 'disproven', status: 'disproven' }),
      finding({ id: '4', proof: 'inconclusive' }),
      finding({ id: '5', status: 'dropped' }),
      finding({ id: '6', status: 'suppressed' }),
    ];
    expect(fs.map(groupOf)).toEqual(['proven', 'advisory', 'refuted', 'advisory', 'dropped', 'suppressed']);
    expect(countFindings(fs)).toEqual({ raised: 6, dropped: 1, suppressed: 1, refuted: 1, advisory: 1, proven: 2, blocking: 1, inconclusive: 1 });
  });
});

describe('the live script', () => {
  const pull = syntheticPullByNumber(ref, ctx, 128);
  const result = synthesizeResult(ref, pull, POOL, 'typescript');
  const script = buildScript(result, pull, ref, DEFAULT_TIMING);

  it('lays the nine stages end to end, stretching only the model-bound ones with the diff', () => {
    const small = buildTimeline(DEFAULT_TIMING, 2);
    const large = buildTimeline(DEFAULT_TIMING, 30);
    expect(small.map((s) => s.key)).toEqual(['ingest', 'context', 'specialists', 'coordinator', 'severity', 'identity', 'proof', 'delivery', 'finalise']);
    expect(timelineTotal(large)).toBeGreaterThan(timelineTotal(small));
    expect(large.find((s) => s.key === 'ingest')!.durationMs).toBe(small.find((s) => s.key === 'ingest')!.durationMs);
    for (let i = 1; i < small.length; i++) expect(small[i]!.startMs).toBe(small[i - 1]!.startMs + small[i - 1]!.durationMs);
  });

  it('pins every log line and claim cue inside the run, in order', () => {
    expect(script.lines.length).toBeGreaterThan(10);
    expect([...script.lines].sort((a, b) => a.atMs - b.atMs)).toEqual(script.lines);
    expect(script.lines.every((l) => l.atMs >= 0 && l.atMs <= script.totalMs)).toBe(true);
    expect(script.claims).toHaveLength(result.findings.length);
    for (const c of script.claims) {
      expect(c.claimedAt).toBeLessThan(c.settledAt);
      expect(c.verdictAt).toBeGreaterThanOrEqual(c.settledAt);
      expect(c.verdictAt).toBeLessThanOrEqual(script.totalMs);
    }
    expect(buildScript(result, pull, ref, DEFAULT_TIMING)).toEqual(script);
  });

  it('knows the running stage at any instant, and when the run is done', () => {
    expect(stageAt(script.stages, 0)).toMatchObject({ index: 0, done: false });
    const proof = script.stages.find((s) => s.key === 'proof')!;
    expect(stageAt(script.stages, proof.startMs + 1).stage.key).toBe('proof');
    expect(stageAt(script.stages, script.totalMs)).toMatchObject({ index: 8, done: true });
  });
});
