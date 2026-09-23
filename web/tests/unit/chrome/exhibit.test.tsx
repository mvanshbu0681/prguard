// OWNER: t1a (wave 1). <Exhibit> — the evidence frame, and hard rule 1 (plan §2):
// registration marks appear only through Exhibit, only on evidence frames.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Lockup, Mark } from '@/components/brand';
import { Exhibit, IndexStrip, ProvenanceLine, ProvenanceStrip, SectionIndex, Surface } from '@/components/chrome';

const text = (el: Element | null) => (el?.textContent ?? '').replace(/ /g, ' ');
const PROOF = 'GET /v1/reviews/4e8b1d0/result → findings[0].proof';

describe('<Exhibit>', () => {
  it('renders exactly four registration marks, one per corner, all decorative', () => {
    const { container } = render(
      <Exhibit index="05" category="Computed severity" provenance="GET /v1/findings/a91f3c2e → severity">
        <p>0.810</p>
      </Exhibit>,
    );
    const marks = container.querySelectorAll('[data-registration-mark]');
    expect(marks).toHaveLength(4);
    expect([...marks].map((m) => m.getAttribute('data-corner')).sort()).toEqual(['bl', 'br', 'tl', 'tr']);
    for (const m of marks) {
      expect(m).toHaveAttribute('aria-hidden', 'true');
      expect(m).toHaveClass('prg-exhibit__mark');
      expect(m.parentElement).toHaveClass('prg-exhibit');
    }
  });

  it('renders the provenance text, with capture time and the fixture-only note', () => {
    const { container } = render(
      <Exhibit index="01" category="Proof bench" provenance={PROOF} capturedAt="2026-09-19T14:22:07Z" ext>
        body
      </Exhibit>,
    );
    const footer = container.querySelector('[data-strip="provenance"]');
    expect(text(footer)).toBe(`${PROOF} · captured 2026-09-19T14:22:07Z · fixture-only: not served by the API yet`);
    expect(footer?.querySelector('time')).toHaveAttribute('dateTime', '2026-09-19T14:22:07Z');
    // The bracket closes the frame: provenance is the last strip, after the body.
    const strips = [...container.querySelectorAll('.prg-exhibit > .prg-strip, .prg-exhibit > .prg-exhibit__body')];
    expect(strips.map((s) => s.getAttribute('data-strip') ?? 'body')).toEqual(['index', 'body', 'provenance']);
  });

  it('prints the index grammar, the identifier as data, and the meta slot', () => {
    const { container } = render(
      <Exhibit index="01" category="PROOF BENCH" identifier="finding a91f3c2e" meta={<span data-testid="meta">python:3.12-slim</span>} provenance={PROOF}>
        body
      </Exhibit>,
    );
    const label = container.querySelector('.prg-index');
    expect(text(label)).toBe('/ 01 — PROOF BENCH · finding a91f3c2e');
    expect(label?.querySelector('.prg-index__id')).toHaveTextContent('finding a91f3c2e');
    expect(screen.getByTestId('meta').closest('.prg-strip__meta')).not.toBeNull();
  });

  it('is a figure named by its index label; section and article are named too, div is not', () => {
    const { container, rerender } = render(<Exhibit index="05" category="Severity" provenance="GET /x" />);
    const figure = container.querySelector('figure.prg-exhibit')!;
    const labelId = figure.getAttribute('aria-labelledby')!;
    expect(container.querySelector('figcaption')).not.toBeNull();
    expect(document.getElementById(labelId)).toHaveTextContent('/ 05 — Severity');

    rerender(<Exhibit as="section" index="05" category="Severity" provenance="GET /x" />);
    expect(container.querySelector('section.prg-exhibit')).toHaveAttribute('aria-labelledby');
    rerender(<Exhibit as="div" index="05" category="Severity" provenance="GET /x" />);
    expect(container.querySelector('div.prg-exhibit')).not.toHaveAttribute('aria-labelledby');
  });

  it('holds the hover state, density and radius as data attributes for the stylesheet', () => {
    const { container } = render(<Exhibit index="01" category="Bench" provenance="GET /x" forceHover density="compact" radius="container" padded />);
    const frame = container.querySelector('.prg-exhibit')!;
    expect(frame).toHaveAttribute('data-hover');
    expect(frame).toHaveAttribute('data-density', 'compact');
    expect(frame).toHaveAttribute('data-radius', 'container');
    expect(frame.querySelector('.prg-exhibit__body')).toHaveAttribute('data-padded');
  });
});

describe('registration marks never escape <Exhibit>', () => {
  it('no other chrome or brand component renders one', () => {
    const { container } = render(
      <div>
        <Surface elevation={2} interactive>
          <IndexStrip index="03" category="Suppressions" meta="12 active" />
          <ProvenanceStrip source="GET /v1/suppressions" capturedAt="2026-09-19T14:22:07Z" />
        </Surface>
        <SectionIndex index="05" category="Computed severity" />
        <ProvenanceLine source="GET /v1/audit" ext />
        <Lockup variant="B" />
        <Mark size={96} />
      </div>,
    );
    expect(container.querySelectorAll('[data-registration-mark], .prg-exhibit__mark')).toHaveLength(0);
  });

  it('only Exhibit.tsx and chrome.css name them in source (misuse is grep-able)', () => {
    const web = fileURLToPath(new URL('../../..', import.meta.url));
    const allowed = new Set([path.join('src', 'components', 'chrome', 'Exhibit.tsx'), path.join('src', 'styles', 'chrome.css')]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|css|mdx?)$/.test(name) && !allowed.has(path.relative(web, full))) {
          const source = readFileSync(full, 'utf8');
          if (/prg-exhibit__mark|data-registration-mark/.test(source)) offenders.push(path.relative(web, full));
        }
      }
    };
    walk(path.join(web, 'src'));
    walk(path.join(web, 'app'));
    expect(offenders).toEqual([]);
  });
});
