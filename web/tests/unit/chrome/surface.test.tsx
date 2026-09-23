// OWNER: t1a (wave 1). <Surface> — the depth model (design §3.6, §5.3; plan
// T1 VERIFY): one ink rung + 1px hairline + the inset top highlight, and zero
// drop shadows. jsdom applies no stylesheet, so the box-shadow contract is
// asserted on the rendered element (no inline shadow) AND on chrome.css itself.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Surface, type SurfaceElevation, type SurfaceVariant } from '@/components/chrome';
import { cssRules, declarationsOf, readCss } from './css';

const INSET = 'inset 0 1px 0 var(--inset-hi)';
const rules = cssRules(readCss('src/styles/chrome.css'));

describe('<Surface>', () => {
  it('renders the elevation and variant as data attributes, with no inline shadow', () => {
    const elevations: SurfaceElevation[] = [0, 1, 2, 3];
    const variants: SurfaceVariant[] = ['panel', 'card', 'inset'];
    for (const elevation of elevations) {
      for (const variant of variants) {
        const { container, unmount } = render(<Surface elevation={elevation} variant={variant}>x</Surface>);
        const el = container.firstElementChild as HTMLElement;
        expect(el).toHaveClass('prg-surface');
        expect(el).toHaveAttribute('data-elevation', String(elevation));
        expect(el).toHaveAttribute('data-variant', variant);
        expect(el.style.boxShadow).toBe('');
        expect(el.getAttribute('style') ?? '').not.toMatch(/shadow|backdrop/i);
        unmount();
      }
    }
  });

  it('defaults to a level-2 panel, and renders as any element via `as`', () => {
    const { container, rerender } = render(<Surface>x</Surface>);
    const div = container.firstElementChild!;
    expect(div.tagName).toBe('DIV');
    expect(div).toHaveAttribute('data-elevation', '2');
    expect(div).toHaveAttribute('data-variant', 'panel');
    expect(div).not.toHaveAttribute('data-interactive');

    rerender(
      <Surface as="a" href="#x" elevation={1} interactive className="block">
        x
      </Surface>,
    );
    const link = container.firstElementChild!;
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '#x');
    expect(link).toHaveAttribute('data-interactive');
    expect(link).toHaveClass('prg-surface', 'block');
  });

  it('never renders a registration mark', () => {
    const { container } = render(<Surface elevation={3} interactive />);
    expect(container.querySelector('[data-registration-mark]')).toBeNull();
  });
});

describe('chrome.css — the depth model has no drop shadow', () => {
  it('declares no box-shadow except the inset top highlight (or none)', () => {
    const shadows = declarationsOf(rules, 'box-shadow');
    expect(shadows.length).toBeGreaterThan(0);
    for (const { selector, value } of shadows) {
      expect([INSET, 'none'], `${selector} { box-shadow: ${value} }`).toContain(value);
    }
  });

  it('gives levels 2 and 3 the inset highlight, and levels 0 and 1 none', () => {
    const shadowOf = (selector: string) => declarationsOf(rules, 'box-shadow').find((d) => d.selector === selector)?.value;
    expect(shadowOf('.prg-surface[data-elevation="0"]')).toBe('none');
    expect(shadowOf('.prg-surface[data-elevation="1"]')).toBe('none');
    expect(shadowOf('.prg-surface[data-elevation="2"]')).toBe(INSET);
    expect(shadowOf('.prg-surface[data-elevation="3"]')).toBe(INSET);
  });

  it('steps exactly one ink rung per level, with the hairline ladder of design §3.6', () => {
    const decl = (selector: string, property: string) => declarationsOf(rules, property).find((d) => d.selector === selector)?.value;
    const expected: [string, string][] = [
      ['var(--ink-0)', 'transparent'],
      ['var(--ink-1)', 'var(--rule-hair)'],
      ['var(--ink-2)', 'var(--rule-1)'],
      ['var(--ink-3)', 'var(--rule-2)'],
    ];
    expected.forEach(([background, border], level) => {
      const selector = `.prg-surface[data-elevation="${level}"]`;
      expect(decl(selector, 'background-color'), selector).toBe(background);
      expect(decl(selector, 'border-color'), selector).toBe(border);
    });
  });

  it('uses no backdrop-filter, no drop-shadow filter, and no transition slower than --dur-1', () => {
    expect(declarationsOf(rules, 'backdrop-filter')).toEqual([]);
    expect(declarationsOf(rules, '-webkit-backdrop-filter')).toEqual([]);
    for (const { value } of declarationsOf(rules, 'filter')) expect(value).not.toMatch(/drop-shadow/);
    for (const { selector, value } of [...declarationsOf(rules, 'transition'), ...declarationsOf(rules, 'transition-duration')]) {
      expect(value, selector).toMatch(/var\(--dur-1\)/);
    }
  });

  it('keeps every hover rule inside @media (hover: hover) (motion §7)', () => {
    const source = readCss('src/styles/chrome.css');
    const withoutHoverMedia = source.replace(/@media \(hover: hover\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(withoutHoverMedia).not.toMatch(/:hover/);
  });
});
