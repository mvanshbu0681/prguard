// The words /overview puts next to its numbers.
import { describe, expect, it } from 'vitest';
import { codeSpans, count, repoPr, runWord, stageLabel, windowCaption, windowPhrase } from '@/components/routes/overview/format';

describe('windowPhrase / windowCaption', () => {
  it('names the window in the headline and in section captions', () => {
    expect(windowPhrase('7d', null)).toBe('in the last 7 days');
    expect(windowPhrase('30d', null)).toBe('in the last 30 days');
    expect(windowPhrase('all', '2026-08-19T09:12:06Z')).toBe('since 19 Aug');
    expect(windowCaption('all', '2026-08-19T09:12:06Z')).toBe('Since 19 Aug');
    expect(windowCaption('all', null)).toBe('All time');
  });
});

describe('runWord', () => {
  it('says how a run ended, in one word', () => {
    expect(runWord({ status: 'succeeded', gate_conclusion: 'failure' })).toEqual({ word: 'Blocked', tone: 'danger' });
    expect(runWord({ status: 'succeeded', gate_conclusion: 'success' })).toEqual({ word: 'Clear', tone: 'ok' });
    expect(runWord({ status: 'succeeded', gate_conclusion: 'neutral' }).word).toBe('Neutral');
    expect(runWord({ status: 'running', gate_conclusion: null }).word).toBe('Reviewing');
    expect(runWord({ status: 'cancelled', gate_conclusion: null }).word).toBe('Superseded');
    expect(runWord({ status: 'failed', gate_conclusion: null }).word).toBe('Failed');
  });
});

describe('codeSpans', () => {
  it('splits a finding title on backticks so identifiers render as code', () => {
    expect(codeSpans('Reject codes before `get_rate()` is called')).toEqual([
      { text: 'Reject codes before ', code: false },
      { text: 'get_rate()', code: true },
      { text: ' is called', code: false },
    ]);
    expect(codeSpans('plain title')).toEqual([{ text: 'plain title', code: false }]);
  });
});

describe('small labels', () => {
  it('repoPr drops the org the shell already shows', () => {
    expect(repoPr({ repository: { owner: 'acme', name: 'ledger' }, pull_request: { number: 340, title: null, author: null } })).toBe('ledger #340');
  });
  it('stageLabel and count', () => {
    expect(stageLabel('specialists')).toBe('Specialists');
    expect(stageLabel('finalise')).toBe('Finalise');
    expect(count(1, 'override')).toBe('1 override');
    expect(count(3, 'override')).toBe('3 overrides');
  });
});

describe('overviewHref', () => {
  it('puts the window in the query string and drops the default', async () => {
    const { overviewHref } = await import('@/components/routes/overview/url-state');
    expect(overviewHref({ window: '7d' })).toBe('/overview?window=7d');
    expect(overviewHref({ window: 'all' })).toBe('/overview');
  });
});
