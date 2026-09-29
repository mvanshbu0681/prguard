// The pure models behind /runs/[id]: the nine-stage rail, the findings grouped by
// outcome, and the live log's poll-to-poll diff. Checked against the demo run.
import { describe, expect, it } from 'vitest';
import demoResult from '@fixtures/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41.result.json';
import demoRun from '@fixtures/live/demo-run.json';
import type { Finding } from '@/lib/api-types';
import { STAGES, type Stage } from '@/lib/contracts';
import { groupFindings, locationLabel, outcomeKey, proofMix, proofTally, tickParts } from '@/components/routes/run/findings-model';
import { logEvents, logStamp, snapshotKey, snapshotOf } from '@/components/routes/run/live-model';
import { stageDuration, stageProgress, stageViews, totalMs } from '@/components/routes/run/stage-model';

const findings = (demoResult as { findings: Finding[] }).findings;
const recorded = Object.fromEntries(demoRun.stages.map((s) => [s.key, s.duration_ms])) as Record<Stage, number>;
const allDone = STAGES.map((key) => ({ key, state: 'done' as const }));

describe('stageViews', () => {
  it('uses the recorded timings when there are any, weighting the rail by them', () => {
    const views = stageViews(allDone, recorded, { ingest: 1577 });
    expect(views.map((v) => v.key)).toEqual([...STAGES]);
    expect(views.every((v) => v.kind === 'recorded')).toBe(true);
    const heaviest = [...views].sort((a, b) => b.weight - a.weight)[0];
    expect(heaviest.key).toBe('specialists');
    expect(totalMs(views)).toBe(41200);
  });

  it('falls back to the typical (p50) timing, and to weight 1 when nothing is known', () => {
    const views = stageViews(allDone, null, { specialists: 14231 });
    const spec = views.find((v) => v.key === 'specialists')!;
    expect(spec).toMatchObject({ ms: 14231, kind: 'typical', weight: 14231 });
    expect(views.find((v) => v.key === 'ingest')).toMatchObject({ ms: null, kind: null, weight: 1 });
  });

  it('keeps unknown stages pending', () => {
    expect(stageViews([{ key: 'ingest', state: 'running' }], null, null).map((v) => v.state)).toEqual([
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });
});

describe('stageDuration / stageProgress', () => {
  it('prints ms under a second, two decimals under ten, one above', () => {
    expect(stageDuration(90)).toBe('90ms');
    expect(stageDuration(1840)).toBe('1.84s');
    expect(stageDuration(14260)).toBe('14.3s');
    expect(stageDuration(null)).toBe('—');
  });

  it('never reads a running stage as finished', () => {
    expect(stageProgress(3, 6000)).toBeCloseTo(0.5);
    expect(stageProgress(60, 6000)).toBe(0.94);
    expect(stageProgress(null, 6000)).toBe(0);
    expect(stageProgress(3, 0)).toBe(0);
  });
});

describe('groupFindings', () => {
  it('orders the demo run blocking → advisory → suppressed → refuted → dropped', () => {
    const groups = groupFindings(findings);
    expect(groups.map((g) => [g.key, g.findings.length])).toEqual([
      ['blocking', 1],
      ['advisory', 2],
      ['suppressed', 1],
      ['refuted', 1],
      ['dropped', 7],
    ]);
    expect(groups.find((g) => g.key === 'dropped')?.collapsed).toBe(true);
    expect(groups[0].findings[0].id).toBe('a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d');
    // Highest severity first inside a group.
    const advisory = groups[1].findings.map((f) => f.severity?.score);
    expect(advisory).toEqual([...advisory].sort((a, b) => (b ?? 0) - (a ?? 0)));
  });

  it('files a finding that never got past proposed as undelivered', () => {
    expect(outcomeKey({ ...findings[0], status: 'proposed', blocking: false })).toBe('undelivered');
    expect(groupFindings([])).toEqual([]);
  });

  it('mixes the survivors by proof status in the product encoding order', () => {
    expect(proofMix(findings)).toEqual([
      { key: 'proven', n: 1 },
      { key: 'disproven', n: 1 },
      { key: 'inconclusive', n: 1 },
      { key: 'not_attempted', n: 2 },
    ]);
  });

  it('tallies what the proof stage did, leaving dropped findings out', () => {
    expect(proofTally(findings)).toEqual({ proven: 1, refuted: 1, inconclusive: 1, unrun: 2, attempted: 3 });
  });

  it('labels a location and splits backtick code out of a title', () => {
    expect(locationLabel(findings[0])).toBe('app/billing/charge.py:41');
    expect(tickParts('Import `MINOR_UNITS` from `app.billing.currency`, where')).toEqual([
      { code: false, text: 'Import ' },
      { code: true, text: 'MINOR_UNITS' },
      { code: false, text: ' from ' },
      { code: true, text: 'app.billing.currency' },
      { code: false, text: ', where' },
    ]);
    expect(tickParts('<b>no html</b>')).toEqual([{ code: false, text: '<b>no html</b>' }]);
  });
});

describe('logEvents', () => {
  const snap = (stage: number, counts: Partial<Record<'proposed' | 'published' | 'suppressed' | 'blocking', number>> = {}, status: 'running' | 'succeeded' = 'running') =>
    snapshotOf({ status, stage_index: stage, stage_label: `label ${stage}`, counts });

  it('on the first poll lists the stages already behind, untimed, then the one running', () => {
    const ev = logEvents(null, snap(3), 4);
    expect(ev.map((e) => [e.text, e.at])).toEqual([
      ['Ingest finished', null],
      ['Context finished', null],
      ['label 3', 4],
    ]);
  });

  it('between polls: finished stages, then what they produced, then the next stage', () => {
    const ev = logEvents(snap(5), snap(7, { suppressed: 1 }), 13);
    expect(ev.map((e) => e.text)).toEqual(['Severity finished', 'Identity finished', '1 finding matched a suppression rule', 'label 7']);
    expect(ev.every((e) => e.at === 13)).toBe(true);
  });

  it('lands the verdict when the run goes terminal', () => {
    const ev = logEvents(snap(8), snap(9, { published: 3, blocking: 1 }, 'succeeded'), 21);
    expect(ev.map((e) => [e.text, e.tone])).toEqual([
      ['Delivery finished', 'muted'],
      ['Finalise finished', 'muted'],
      ['Posted 3 comments to the pull request', 'default'],
      ['1 proven bug blocks the merge', 'danger'],
      ['Verdict: blocked', 'danger'],
    ]);
  });

  it('adds nothing when nothing changed, and keys ids by snapshot so they stay unique', () => {
    const a = snap(3);
    expect(logEvents(a, snap(3), 9)).toEqual([]);
    const ids = [...logEvents(null, a, 1), ...logEvents(a, snap(4), 2)].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(snapshotKey(a)).not.toBe(snapshotKey(snap(4)));
  });

  it('stamps +m:ss', () => {
    expect(logStamp(0)).toBe('+0:00');
    expect(logStamp(75.9)).toBe('+1:15');
    expect(logStamp(null)).toBe('—');
  });
});
