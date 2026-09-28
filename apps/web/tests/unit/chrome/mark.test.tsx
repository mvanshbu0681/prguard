// THE WITNESS EYE: the geometry every renderer shares (forms, frames, the
// pupil's safe travel, the live states) and the <Mark>, <TrackingMark>,
// <Wordmark> and <Lockup> components.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Lockup,
  LOCKUP_SIZES,
  LOCKUP_STACKED,
  Mark,
  MARK_ARTBOARD,
  MARK_FILL,
  MARK_FORMS,
  MARK_INK,
  MARK_LID_POINTS,
  MARK_PUPIL,
  MARK_PUPIL_TRAVEL,
  markClearSpace,
  markForm,
  markGeometry,
  markParts,
  TrackingMark,
  Wordmark,
  type MarkForm,
  type MarkFrame,
} from '@/components/brand';

const partsOf = (container: HTMLElement) => [...container.querySelectorAll('path')].map((p) => p.getAttribute('data-part'));

/** The lid's centreline, sampled: the arc, then both arms of the check. */
function lidSamples(steps = 300): [number, number][] {
  const { start: s, control: c, corner: k, vertex: v, tail: t } = MARK_LID_POINTS;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push([(1 - u) ** 2 * s[0] + 2 * (1 - u) * u * c[0] + u * u * k[0], (1 - u) ** 2 * s[1] + 2 * (1 - u) * u * c[1] + u * u * k[1]]);
  }
  for (const [a, b] of [
    [k, v],
    [v, t],
  ] as const) {
    for (let i = 0; i <= steps; i++) out.push([a[0] + (b[0] - a[0]) * (i / steps), a[1] + (b[1] - a[1]) * (i / steps)]);
  }
  return out;
}

describe('the forms', () => {
  it('switches to the small form when the eye would render under 20px wide', () => {
    expect(markForm(16)).toBe('small'); // 14.7px of eye
    expect(markForm(21)).toBe('small'); // 19.3px
    expect(markForm(22)).toBe('regular'); // 20.2px
    expect(markForm(96)).toBe('regular');
    expect(markForm(20, 'tile')).toBe('small');
    expect(markForm(28, 'circle')).toBe('small');
    expect(markForm(32, 'circle')).toBe('regular');
  });

  it('thickens the lid and shrinks the pupil in the small form', () => {
    expect(MARK_FORMS.small.stroke).toBeGreaterThan(MARK_FORMS.regular.stroke);
    expect(MARK_FORMS.small.pupil).toBeLessThan(MARK_FORMS.regular.pupil);
    expect(markGeometry(16).stroke).toBe(MARK_FORMS.small.stroke);
    expect(markGeometry(32).stroke).toBe(MARK_FORMS.regular.stroke);
    expect(markGeometry(512, { form: 'small' }).pupil.r).toBe(MARK_FORMS.small.pupil);
  });

  it('never draws below 16px', () => {
    expect(markGeometry(8).size).toBe(16);
    expect(render(<Mark size={10} />).container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});

describe('the frames', () => {
  it('centres every viewBox on the artboard, and the measured ink on it too', () => {
    expect(MARK_INK.x + MARK_INK.w / 2).toBeCloseTo(MARK_ARTBOARD / 2, 2);
    expect(MARK_INK.y + MARK_INK.h / 2).toBeCloseTo(MARK_ARTBOARD / 2, 2);
    for (const frame of ['bare', 'tile', 'touch', 'circle'] as MarkFrame[]) {
      const { box } = markGeometry(64, { frame });
      expect(box.x + box.side / 2).toBeCloseTo(MARK_ARTBOARD / 2, 2);
      expect(box.y).toBe(box.x);
    }
  });

  it("fills each frame's share of the width with the eye", () => {
    for (const frame of ['bare', 'tile', 'touch', 'circle'] as MarkFrame[]) {
      for (const form of ['regular', 'small'] as MarkForm[]) {
        const g = markGeometry(64, { frame, form });
        const ink = MARK_INK.w + (g.stroke - MARK_FORMS.regular.stroke);
        expect(ink / g.box.side).toBeCloseTo(MARK_FILL[frame], 2);
      }
    }
  });

  it('keeps the whole eye inside the circle crop', () => {
    const { box } = markGeometry(512, { frame: 'circle', form: 'small' });
    const r = box.side / 2;
    const half = MARK_FORMS.small.stroke / 2;
    for (const [x, y] of lidSamples(60)) expect(Math.hypot(x - 16, y - 16) + half).toBeLessThan(r);
  });
});

describe('the pupil', () => {
  const lid = lidSamples();
  const clearance = (x: number, y: number, form: MarkForm) =>
    Math.min(...lid.map(([lx, ly]) => Math.hypot(x - lx, y - ly))) - MARK_FORMS[form].pupil - MARK_FORMS[form].stroke / 2;

  it('clears both lids at rest and at the edge of its travel, in both forms', () => {
    for (const form of ['regular', 'small'] as MarkForm[]) {
      expect(clearance(MARK_PUPIL.cx, MARK_PUPIL.cy, form)).toBeGreaterThan(1);
      for (let k = 0; k < 48; k++) {
        const a = (2 * Math.PI * k) / 48;
        const x = MARK_PUPIL.cx + MARK_PUPIL_TRAVEL.x * Math.cos(a);
        const y = MARK_PUPIL.cy + MARK_PUPIL_TRAVEL.y * Math.sin(a);
        expect(clearance(x, y, form), `${form} at ${Math.round((a * 180) / Math.PI)}°`).toBeGreaterThan(0.5);
      }
    }
  });

  it('is the only part the live states change', () => {
    const g = markGeometry(32, { frame: 'tile', form: 'small' });
    const part = (live: 'running' | 'clear' | 'blocked' | undefined, name: 'lid' | 'pupil') => markParts(g, live).find((p) => p.part === name)!;
    expect(part(undefined, 'pupil')).toMatchObject({ paint: 'bar' });
    expect(part(undefined, 'pupil').stroke).toBeUndefined();
    expect(part('clear', 'pupil')).toMatchObject({ paint: 'bar', live: 'clear' });
    expect(part('running', 'pupil')).toMatchObject({ paint: 'bar', live: 'running' });
    expect(part('running', 'pupil').stroke).toBeGreaterThan(0); // a ring
    expect(part('blocked', 'pupil')).toMatchObject({ paint: 'alarm', live: 'blocked' });
    for (const live of ['running', 'clear', 'blocked'] as const) expect(part(live, 'lid')).toMatchObject({ paint: 'bar', stroke: g.stroke });
  });
});

describe('clear space', () => {
  it('is a sixth of the edge', () => {
    expect(markClearSpace(24)).toBe(4);
    expect(markClearSpace(20)).toBe(3);
    expect(markClearSpace(32)).toBe(5);
  });
});

describe('<TrackingMark>', () => {
  it('renders the eye at rest in currentColor, decorative unless titled', () => {
    const svg = render(<TrackingMark size={30} />).container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
    const pupil = svg.querySelector('circle')!;
    expect(pupil).toHaveAttribute('fill', 'currentColor');
    expect([Number(pupil.getAttribute('cx')), Number(pupil.getAttribute('cy'))]).toEqual([MARK_PUPIL.cx, MARK_PUPIL.cy]);
    const named = render(<TrackingMark title="Witness" />).container.querySelector('svg')!;
    expect(named).toHaveAttribute('role', 'img');
    expect(named).toHaveAttribute('aria-label', 'Witness');
  });
});

describe('<Mark>', () => {
  it('is decorative by default and named when titled', () => {
    const plain = render(<Mark />).container.querySelector('svg')!;
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    expect(plain).not.toHaveAttribute('role');

    const named = render(<Mark title="Witness" />).container.querySelector('svg')!;
    expect(named).toHaveAttribute('role', 'img');
    expect(named).toHaveAttribute('aria-label', 'Witness');
    expect(named).not.toHaveAttribute('aria-hidden');
  });

  it('draws the lid (stroked) and the pupil', () => {
    const svg = render(<Mark size={32} />).container.querySelector('svg')!;
    expect(partsOf(svg as unknown as HTMLElement)).toEqual(['lid', 'pupil']);
    expect(svg.querySelector('[data-part="lid"]')).toHaveAttribute('data-stroked');
    expect(svg.querySelector('[data-part="pupil"]')).not.toHaveAttribute('data-stroked');
  });

  it('carries the tone for the stylesheet, and paints with classes, never inline colour', () => {
    for (const tone of ['signal', 'mono', 'ink'] as const) {
      const svg = render(<Mark size={48} tone={tone} />).container.querySelector('svg')!;
      expect(svg).toHaveAttribute('data-tone', tone);
      for (const path of svg.querySelectorAll('path')) {
        expect(path.getAttribute('class')).toMatch(/^prg-mark__(bar|alarm)$/);
        expect(path).not.toHaveAttribute('fill');
      }
    }
  });
});

describe('<Wordmark> and <Lockup>', () => {
  it('renders the prose name, set in caps by CSS, never below 12px', () => {
    const { container } = render(<Wordmark size={9} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveTextContent('Witness');
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
    expect(c.querySelector('svg')).toHaveAttribute('data-form', 'regular');
    expect((c.querySelector('.prg-wordmark') as HTMLElement).style.fontSize).toBe('15px');

    const d = render(<Lockup variant="D" />).container.firstElementChild!;
    expect(d.querySelector('.prg-wordmark')).toBeNull();
    expect(d.querySelector('svg')).toHaveAttribute('aria-label', 'Witness');
  });

  it('sizes the hairline to the wordmark cap height and pads by the clear space on request', () => {
    const el = render(<Lockup variant="A" clearSpace />).container.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue('--prg-lockup-rule')).toBe('11px'); // 15px × 0.716
    expect(el.style.padding).toBe('3px'); // the 20px mark ÷ 6
  });
});
