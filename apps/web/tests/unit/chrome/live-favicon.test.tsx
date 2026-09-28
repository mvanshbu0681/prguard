// useLiveFavicon (brand-gaps §C): swaps link[rel=icon] to a runtime-drawn
// 32×32 frame of the Witness eye, ticks the pupil while running, holds still
// under reduced motion, and restores the original icons.
//
// jsdom has no 2D canvas, so getContext returns a recording fake and
// toDataURL returns a data URL that names the last frame painted. That is
// enough to prove what was drawn, and when.
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WITNESS_HEX, createLiveFavicon, paintLiveFavicon, useLiveFavicon, type LiveFaviconState } from '@/components/brand';

type Shape = 'tile' | 'lid' | 'pupil';
type Op = { kind: 'fill' | 'stroke'; shape: Shape; style: string; alpha: number };

/** Records each fill/stroke with the shape of the path it paints (tile = roundRect, lid = the curve, pupil = the arc). */
function fakeContext(onClear?: () => void) {
  const ops: Op[] = [];
  let shape: Shape | null = null;
  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    setTransform() {},
    clearRect() {
      onClear?.();
    },
    beginPath() {
      shape = null;
    },
    roundRect() {
      shape = 'tile';
    },
    moveTo() {},
    quadraticCurveTo() {
      shape = 'lid';
    },
    lineTo() {},
    arc() {
      shape = 'pupil';
    },
    fill() {
      ops.push({ kind: 'fill', shape: shape!, style: String(ctx.fillStyle), alpha: ctx.globalAlpha });
    },
    stroke() {
      ops.push({ kind: 'stroke', shape: shape!, style: String(ctx.strokeStyle), alpha: ctx.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** A frame's identity from its ops: the pupil's state. */
function describeFrame(ops: Op[]): string {
  const pupil = ops.find((op) => op.shape === 'pupil');
  if (!pupil) return 'empty';
  if (pupil.kind === 'stroke') return pupil.alpha < 1 ? 'running:rest' : 'running:on';
  return pupil.style === WITNESS_HEX.alarm ? 'blocked' : 'clear';
}

let painted: Op[] = [];

beforeEach(() => {
  painted = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    // A new frame starts by clearing the canvas.
    const { ctx, ops } = fakeContext(() => (ops.length = 0));
    painted = ops;
    return ctx as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,${btoa(describeFrame(painted))}`);

  document.head.innerHTML = [
    '<link rel="icon" href="/favicon.ico" sizes="32x32" type="image/x-icon">',
    '<link rel="icon" href="/icon.svg" type="image/svg+xml" sizes="any">',
    '<link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" type="image/png">',
  ].join('');
  document.documentElement.removeAttribute('data-motion');
});

afterEach(() => {
  // Unmount first: a live controller observes html[data-motion], and resetting
  // that attribute below must not wake one up against the real (absent) canvas.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-motion');
  Reflect.deleteProperty(window, 'matchMedia');
});

const icons = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
const frameOf = (el: Element) => {
  const href = el.getAttribute('href') ?? '';
  return href.startsWith('data:image/png;base64,') ? atob(href.slice('data:image/png;base64,'.length)) : href;
};

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: matches && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

describe('useLiveFavicon', () => {
  it('swaps every link[rel=icon] to a drawn 32×32 PNG and restores them on unmount', () => {
    const { unmount } = renderHook(({ state }: { state: LiveFaviconState }) => useLiveFavicon(state), { initialProps: { state: 'clear' } });
    for (const link of icons()) {
      expect(frameOf(link)).toBe('clear');
      expect(link).toHaveAttribute('type', 'image/png');
      expect(link).toHaveAttribute('sizes', '32x32');
    }
    // apple-touch-icon is its own rel token, and is left alone.
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-icon.png');

    unmount();
    const [ico, svg] = icons();
    expect(ico).toHaveAttribute('href', '/favicon.ico');
    expect(ico).toHaveAttribute('type', 'image/x-icon');
    expect(ico).toHaveAttribute('sizes', '32x32');
    expect(svg).toHaveAttribute('href', '/icon.svg');
    expect(svg).toHaveAttribute('type', 'image/svg+xml');
    expect(svg).toHaveAttribute('sizes', 'any');
  });

  it('follows state changes, and null restores the static icons without unmounting', () => {
    const { rerender } = renderHook(({ state }: { state: LiveFaviconState }) => useLiveFavicon(state), { initialProps: { state: 'clear' as LiveFaviconState } });
    rerender({ state: 'blocked' });
    expect(icons().map(frameOf)).toEqual(['blocked', 'blocked']);
    rerender({ state: null });
    expect(icons().map((l) => l.getAttribute('href'))).toEqual(['/favicon.ico', '/icon.svg']);
    rerender({ state: 'clear' });
    expect(icons().map(frameOf)).toEqual(['clear', 'clear']);
  });

  it('ticks while running: the dip for the first 12% of each 1200ms beat, full brightness after', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useLiveFavicon('running'));
    const [link] = icons();
    expect(frameOf(link)).toBe('running:rest');
    vi.advanceTimersByTime(143);
    expect(frameOf(link)).toBe('running:rest');
    vi.advanceTimersByTime(1); // 144ms = 12% of 1200
    expect(frameOf(link)).toBe('running:on');
    vi.advanceTimersByTime(1200 - 144 - 1);
    expect(frameOf(link)).toBe('running:on');
    vi.advanceTimersByTime(1); // the next beat
    expect(frameOf(link)).toBe('running:rest');
    unmount();
    expect(link).toHaveAttribute('href', '/favicon.ico');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws the running frame once, at full brightness, under prefers-reduced-motion', () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    renderHook(() => useLiveFavicon('running'));
    const [link] = icons();
    expect(frameOf(link)).toBe('running:on');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(frameOf(link)).toBe('running:on');
  });

  it('honours html[data-motion="reduced"] (the footer toggle) the same way', () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-motion', 'reduced');
    renderHook(() => useLiveFavicon('running'));
    expect(frameOf(icons()[0])).toBe('running:on');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('creates a link when the page has none, and removes it on restore', () => {
    document.head.innerHTML = '';
    const { unmount } = renderHook(() => useLiveFavicon('blocked'));
    const created = document.head.querySelector('link[data-live-favicon]');
    expect(created).toHaveAttribute('rel', 'icon');
    expect(frameOf(created!)).toBe('blocked');
    unmount();
    expect(document.head.querySelector('link')).toBeNull();
  });
});

describe('createLiveFavicon', () => {
  it('does nothing, and throws nothing, without a 2D canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const live = createLiveFavicon();
    expect(() => live.set('running')).not.toThrow();
    expect(icons().map((l) => l.getAttribute('href'))).toEqual(['/favicon.ico', '/icon.svg']);
    live.destroy();
  });
});

describe('paintLiveFavicon', () => {
  const paint = (state: 'running' | 'clear' | 'blocked', beat?: 'on' | 'rest') => {
    const { ctx, ops } = fakeContext();
    paintLiveFavicon(ctx, state, beat);
    return ops;
  };

  it('fills the ink tile first (never transparent), then strokes the lid and fills the pupil in lime', () => {
    const ops = paint('clear');
    expect(ops.map((op) => `${op.kind}:${op.shape}`)).toEqual(['fill:tile', 'stroke:lid', 'fill:pupil']);
    expect(ops[0].style).toBe(WITNESS_HEX.ink);
    expect(ops[1].style).toBe(WITNESS_HEX.lime);
    expect(ops[2].style).toBe(WITNESS_HEX.lime);
  });

  it('turns only the pupil --alarm when blocked', () => {
    const ops = paint('blocked');
    expect(ops[1]).toMatchObject({ shape: 'lid', style: WITNESS_HEX.lime });
    expect(ops[2]).toMatchObject({ kind: 'fill', shape: 'pupil', style: WITNESS_HEX.alarm });
  });

  it('draws the running pupil as a ring, dimmed to 0.35 on the dip, and never dims the lid', () => {
    const on = paint('running', 'on');
    const rest = paint('running', 'rest');
    expect(on[2]).toMatchObject({ kind: 'stroke', shape: 'pupil', alpha: 1 });
    expect(rest[2]).toMatchObject({ kind: 'stroke', shape: 'pupil', alpha: 0.35 });
    expect(rest[1]).toMatchObject({ shape: 'lid', alpha: 1 });
  });
});
