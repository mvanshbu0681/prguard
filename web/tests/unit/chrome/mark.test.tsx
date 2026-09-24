// OWNER: t1a (wave 1). THE BENCH mark (brand-gaps §A): the mandatory
// simplification ladder, the pixel-snapped geometry every renderer shares, and
// the <Mark>, <Wordmark> and <Lockup> components.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CIRCLE_BAR_WIDTH,
  Lockup,
  LOCKUP_SIZES,
  LOCKUP_STACKED,
  Mark,
  markClearSpace,
  markForm,
  markGeometry,
  markParts,
  Wordmark,
} from '@/components/brand';

const partsOf = (container: HTMLElement) => [...container.querySelectorAll('path')].map((p) => p.getAttribute('data-part'));

describe('the simplification ladder', () => {
  it('picks the form by rendered size: ≥32 full · 20–31 no ticks · ≤19 two bars', () => {
    expect(markForm(16)).toBe('two-bars');
    expect(markForm(19)).toBe('two-bars');
    expect(markForm(20)).toBe('no-ticks');
    expect(markForm(24)).toBe('no-ticks');
    expect(markForm(31)).toBe('no-ticks');
    expect(markForm(32)).toBe('full');
    expect(markForm(96)).toBe('full');
  });

  it('draws every circular crop as two bars, whatever the size', () => {
    for (const size of [16, 32, 96, 512]) expect(markForm(size, 'circle')).toBe('two-bars');
  });

  it('<Mark> renders the right parts at 16, 24 and 32', () => {
    const at16 = render(<Mark size={16} />).container;
    expect(at16.querySelector('svg')).toHaveAttribute('data-form', 'two-bars');
    expect(partsOf(at16)).toEqual(['base', 'head']);

    const at24 = render(<Mark size={24} />).container;
    expect(at24.querySelector('svg')).toHaveAttribute('data-form', 'no-ticks');
    expect(partsOf(at24)).toEqual(['base', 'seam', 'head']);

    const at32 = render(<Mark size={32} />).container;
    expect(at32.querySelector('svg')).toHaveAttribute('data-form', 'full');
    expect(partsOf(at32)).toEqual(['tick', 'tick', 'tick', 'tick', 'base', 'seam', 'head']);
  });

  it('bumps the stroke to 2px in the ≤19px form, and never draws below 16px', () => {
    expect(markGeometry(16).base.stroke).toBe(2);
    expect(markGeometry(19).base.stroke).toBe(2);
    const tiny = markGeometry(10);
    expect(tiny.size).toBe(16);
    expect(tiny.form).toBe('two-bars');
    const { container } = render(<Mark size={8} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});

describe('the geometry', () => {
  const sizes = [16, 17, 18, 19, 20, 21, 24, 28, 31, 32, 40, 48, 64, 96, 128];

  it('lands every edge on a whole pixel, centred, with a hollow of at least 1px', () => {
    for (const size of sizes) {
      const g = markGeometry(size);
      const boxes = [g.base, g.head, ...(g.seam ? [g.seam] : [])];
      for (const b of boxes) for (const v of [b.x, b.y, b.w, b.h]) expect(Number.isInteger(v), `${size}px: ${JSON.stringify(b)}`).toBe(true);
      expect(Number.isInteger(g.base.stroke)).toBe(true);
      expect(g.base.h - 2 * g.base.stroke, `${size}px hollow`).toBeGreaterThanOrEqual(1);
      // Horizontally and vertically centred on the artboard.
      expect(g.base.x + g.base.w / 2).toBe(size / 2);
      const top = g.base.y;
      const bottom = g.head.y + g.head.h;
      expect((top + bottom) / 2).toBe(size / 2);
      // The two bars match, the head sits below the base, and they never touch.
      expect([g.head.w, g.head.h]).toEqual([g.base.w, g.base.h]);
      expect(g.head.y).toBeGreaterThan(g.base.y + g.base.h);
    }
  });

  it('joins the bars with a seam flush left, one stroke wide, only from 20px', () => {
    for (const size of sizes) {
      const g = markGeometry(size);
      if (size < 20) {
        expect(g.seam).toBeNull();
        continue;
      }
      expect(g.seam).not.toBeNull();
      expect(g.seam!.x).toBe(g.base.x);
      expect(g.seam!.w).toBe(g.base.stroke);
      expect(g.seam!.y).toBeLessThanOrEqual(g.base.y + g.base.h);
      expect(g.seam!.y + g.seam!.h).toBeGreaterThanOrEqual(g.head.y);
    }
  });

  it('places four detached L-shaped ticks at the corners of the full form only', () => {
    expect(markGeometry(31).ticks).toEqual([]);
    const g = markGeometry(96);
    expect(g.ticks.map((t) => t.corner)).toEqual(['tl', 'tr', 'bl', 'br']);
    // 24-unit construction scaled by 4: 5×5 ticks, 1.5 thick, outer corners at (1,1) and (23,23).
    const [tl, , , br] = g.ticks;
    expect([tl.x, tl.y, tl.len, tl.t]).toEqual([4, 4, 20, 6]);
    expect([br.x + br.len, br.y + br.len]).toEqual([92, 92]);
    // Detached: no tick overlaps the bars.
    for (const t of g.ticks) {
      const overlapsX = t.x < g.base.x + g.base.w && t.x + t.len > g.base.x;
      const overlapsY = t.y < g.head.y + g.head.h && t.y + t.len > g.base.y;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });

  it('follows the 24-unit construction at 24px: 14×4 bars, a 4px gap, a 1px stroke', () => {
    const g = markGeometry(24);
    expect([g.base.x, g.base.y, g.base.w, g.base.h]).toEqual([5, 6, 14, 4]);
    expect([g.head.x, g.head.y]).toEqual([5, 14]);
    expect(g.base.stroke).toBe(1);
  });

  it('scales the avatar bars to 56% of the frame, two bars, no seam, no ticks', () => {
    const g = markGeometry(512, { crop: 'circle' });
    expect(g.form).toBe('two-bars');
    expect(g.seam).toBeNull();
    expect(g.ticks).toEqual([]);
    expect(Math.abs(g.base.w / 512 - CIRCLE_BAR_WIDTH)).toBeLessThan(0.01);
  });

  it('keeps the avatar legible at 20px: 2px stroke, 1px hollow, 2px gap, all whole pixels', () => {
    const g = markGeometry(20, { crop: 'circle' });
    expect(g.base.stroke).toBe(2);
    expect(g.base.h - 2 * g.base.stroke).toBe(1);
    expect(g.head.y - (g.base.y + g.base.h)).toBe(2);
    for (const v of [g.base.y, g.base.h, g.head.y, g.head.h]) expect(Number.isInteger(v)).toBe(true);
  });

  it('changes only the head bar for the live states', () => {
    const g = markGeometry(32, { form: 'two-bars' });
    const head = (live?: 'running' | 'clear' | 'blocked') => markParts(g, live).find((p) => p.part === 'head')!;
    expect(head().paint).toBe('bar');
    expect(head().fillRule).toBeUndefined();
    expect(head('clear')).toMatchObject({ paint: 'bar', live: 'clear' });
    expect(head('running')).toMatchObject({ paint: 'bar', fillRule: 'evenodd', live: 'running' });
    expect(head('blocked')).toMatchObject({ paint: 'alarm', live: 'blocked' });
    // The base bar never takes the alarm colour.
    for (const live of ['running', 'clear', 'blocked'] as const) {
      expect(markParts(g, live).find((p) => p.part === 'base')!.paint).toBe('bar');
    }
  });

  it('sets the clear space to one bar height: size ÷ 6', () => {
    expect(markClearSpace(24)).toBe(4);
    expect(markClearSpace(20)).toBe(3);
    expect(markClearSpace(32)).toBe(5);
  });
});

describe('<Mark>', () => {
  it('is decorative by default and named when titled', () => {
    const plain = render(<Mark />).container.querySelector('svg')!;
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    expect(plain).not.toHaveAttribute('role');

    const named = render(<Mark title="PRGuard" />).container.querySelector('svg')!;
    expect(named).toHaveAttribute('role', 'img');
    expect(named).toHaveAttribute('aria-label', 'PRGuard');
    expect(named).not.toHaveAttribute('aria-hidden');
  });

  it('carries the tone for the stylesheet, and paints with classes, never inline colour', () => {
    for (const tone of ['signal', 'mono', 'ink'] as const) {
      const svg = render(<Mark size={48} tone={tone} />).container.querySelector('svg')!;
      expect(svg).toHaveAttribute('data-tone', tone);
      for (const path of svg.querySelectorAll('path')) {
        expect(path.getAttribute('class')).toMatch(/^prg-mark__(bar|tick|alarm)$/);
        expect(path).not.toHaveAttribute('fill');
      }
    }
  });
});

describe('<Wordmark> and <Lockup>', () => {
  it('renders the prose name, set in caps by CSS, never below 12px', () => {
    const { container } = render(<Wordmark size={9} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveTextContent('PRGuard');
    expect(el).toHaveClass('prg-wordmark');
    expect(el.style.fontSize).toBe('12px');
  });

  it('A: mark, hairline, wordmark · B adds the rail · C stacks with no hairline · D is the mark alone', () => {
    const a = render(<Lockup variant="A" />).container.firstElementChild!;
    expect([...a.children].map((c) => c.getAttribute('class'))).toEqual(['prg-mark', 'prg-lockup__rule', 'prg-wordmark prg-lockup__word']);
    expect(a.querySelector('svg')).toHaveAttribute('width', String(LOCKUP_SIZES.nav.mark));
    expect((a as HTMLElement).style.getPropertyValue('--prg-lockup-gap')).toBe('10px');

    const b = render(<Lockup variant="B" />).container.firstElementChild as HTMLElement;
    expect(b).toHaveAttribute('data-variant', 'B');
    expect(b.style.getPropertyValue('--prg-rail-width')).toMatch(/em$/);

    const c = render(<Lockup variant="C" />).container.firstElementChild!;
    expect(c.querySelector('.prg-lockup__rule')).toBeNull();
    expect(c.querySelector('svg')).toHaveAttribute('width', String(LOCKUP_STACKED.mark));
    expect(c.querySelector('svg')).toHaveAttribute('data-form', 'full');
    expect((c.querySelector('.prg-wordmark') as HTMLElement).style.fontSize).toBe('15px');

    const d = render(<Lockup variant="D" />).container.firstElementChild!;
    expect(d.querySelector('.prg-wordmark')).toBeNull();
    expect(d.querySelector('svg')).toHaveAttribute('aria-label', 'PRGuard');
  });

  it('sizes the hairline to the wordmark cap height and pads by the clear space on request', () => {
    const el = render(<Lockup variant="A" clearSpace />).container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue('--prg-lockup-rule')).toBe('11px'); // 15px × 0.716
    expect(el.style.padding).toBe('3px'); // the 20px mark ÷ 6
  });
});
