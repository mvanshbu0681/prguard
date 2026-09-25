// OWNER: t1a (wave 1). The OG card (brand-gaps §C): its story comes from the
// fixture corpus (plan A10), its copy is fixed, and every style it renders obeys
// the Satori constraints (flat hex only: no custom properties, no oklch, no
// mask, no backdrop-filter, no feTurbulence).
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OgCard, OG_SIZE } from '../../../app/og/card';
import { loadOgStory, OG_FALLBACK, pytestSummary } from '../../../app/og/data';
import { WEB } from './css';

const FIXTURES = path.join(WEB, 'public', 'fixtures');

describe('pytestSummary', () => {
  it('reduces a captured excerpt to its last pytest summary line', () => {
    expect(pytestSummary('collected 1 item\n\ntests/test_repro_7e3f1a.py .\n\n1 passed in 0.42s\n')).toBe('1 passed in 0.42s');
    expect(pytestSummary('==== FAILURES ====\nE   AttributeError\n==== 1 failed in 0.39s ====')).toBe('1 failed in 0.39s');
    expect(pytestSummary('1 failed, 2 passed, 1 warning in 1.07s')).toBe('1 failed, 2 passed, 1 warning in 1.07s');
    expect(pytestSummary('2 passed in 0.10s\n…\n1 failed in 0.39s')).toBe('1 failed in 0.39s');
    expect(pytestSummary('no summary here')).toBeNull();
    expect(pytestSummary(null)).toBeNull();
    expect(pytestSummary(42)).toBeNull();
  });
});

describe('loadOgStory', () => {
  it('reads the binding SHAs from the fixture manifest, shortened to 7 characters', () => {
    const manifest = JSON.parse(readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8'));
    const story = loadOgStory(FIXTURES);
    expect(story.baseSha).toBe(manifest.ids.base_sha.slice(0, 7));
    expect(story.headSha).toBe(manifest.ids.head_sha.slice(0, 7));
    expect(story.source.shas).toBe('manifest');
    // A10: the canonical story.
    expect([story.baseSha, story.headSha]).toEqual(['7c41a09', '9c2d4b1']);
  });

  it('takes the pytest lines from the proven finding in the demo run when the corpus has them', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'og-fixtures-'));
    const ids = { base_sha: 'aaaaaaa1111', head_sha: 'bbbbbbb2222', demo_review_id: 'r1', proven_finding_id: 'f1' };
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ids }));
    mkdirSync(path.join(dir, 'reviews'));
    const proof = { base: { exit_code: 0, excerpt: '… 1 passed in 0.51s' }, head: { exit_code: 1, excerpt: '… 1 failed in 0.47s' } };
    writeFileSync(path.join(dir, 'reviews', 'r1.result.json'), JSON.stringify({ findings: [{ id: 'f0' }, { id: 'f1', proof }] }));
    const story = loadOgStory(dir);
    expect(story).toMatchObject({ baseSha: 'aaaaaaa', headSha: 'bbbbbbb', baseResult: '1 passed in 0.51s', headResult: '1 failed in 0.47s' });
    expect(story.source).toEqual({ shas: 'manifest', results: 'fixture' });
  });

  it('falls back to the canonical hero story when the corpus is missing or a stub', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'og-empty-'));
    expect(loadOgStory(empty)).toMatchObject({ ...OG_FALLBACK, source: { shas: 'fallback', results: 'fallback' } });
  });
});

describe('<OgCard>', () => {
  const story = loadOgStory(FIXTURES);
  const markup = renderToStaticMarkup(<OgCard story={story} />);
  const plain = markup
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

  it('is 1200 × 630', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
    expect(markup).toMatch(/^<div style="[^"]*width:1200px;height:630px/);
  });

  it('carries the lockup, the headline, the bench, the PROVEN chip and the rail', () => {
    for (const phrase of [
      'PRGUARD',
      "We don't guess.",
      'We run the test.',
      `base ${story.baseSha}`,
      story.baseResult,
      `HEAD ${story.headSha}`,
      story.headResult,
      'PROVEN',
      'PASSES AT BASE · FAILS AT HEAD · PROVEN',
      '→ blocks merge',
    ]) {
      expect(plain, phrase).toContain(phrase);
    }
  });

  it('obeys the Satori constraints in every style it renders', () => {
    const styles = [...markup.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    expect(styles.length).toBeGreaterThan(50);
    for (const style of styles) {
      expect(style).not.toMatch(/var\(|oklch|mask|backdrop|blur|box-shadow|rgba?\(0, 0, 0/i);
    }
    expect(markup).not.toMatch(/feTurbulence|<filter|<canvas/i);
    // Colours are literal 6-digit hex.
    for (const m of markup.matchAll(/(?:color|background-color|fill):([^;"]+)/g)) {
      expect(m[1].trim(), m[0]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('draws no registration marks: those belong to <Exhibit> alone', () => {
    // The only L-shapes on the card are the mark's own corner ticks (four paths inside its SVG).
    const borderedCorners = [...markup.matchAll(/style="([^"]*)"/g)].filter((m) => /border-(top|bottom)-width:1px/.test(m[1]) && /border-(left|right)-width:1px/.test(m[1]));
    expect(borderedCorners).toEqual([]);
  });
});

describe('opengraph-image.alt.txt', () => {
  const alt = readFileSync(path.join(WEB, 'app', 'opengraph-image.alt.txt'), 'utf8').trim();

  it('describes the card in the product voice', () => {
    expect(alt.length).toBeGreaterThan(40);
    expect(alt).toContain('PRGuard');
    expect(alt).not.toMatch(/!/);
    expect(alt).not.toMatch(/\b(intelligent|smart|seamless|powerful|robust|supercharge|unlock|leverage|empower|AI-powered|best-in-class)\b/i);
    expect((alt.match(/—/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
