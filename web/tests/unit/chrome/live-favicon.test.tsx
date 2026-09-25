// OWNER: t1a (wave 1). useLiveFavicon (brand-gaps §C): swaps link[rel=icon]
// to a runtime-drawn 32×32 frame, ticks while running, holds still under
// reduced motion, and restores the original icons.
//
// jsdom has no 2D canvas, so getContext returns a recording fake and
// toDataURL returns a data URL that names the last frame painted. That is
// enough to prove what was drawn, and when.
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND_HEX, createLiveFavicon, paintLiveFavicon, useLiveFavicon, type LiveFaviconState } from '@/components/brand';

type Op = { kind: 'fillRect'; x: number; y: number; w: number; h: number; fill: string; alpha: number };

function fakeContext() {
  const ops: Op[] = [];
  const ctx = {
    fillStyle: '#000000',
    globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      ops.push({ kind: 'fillRect', x, y, w, h, fill: String(ctx.fillStyle), alpha: ctx.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** A frame's identity from its ops: which colour the head bar is, and whether it is hollow or dimmed. */
function describeFrame(ops: Op[]): string {
  const head = ops.slice(5); // background + the base bar's four rects come first
  if (head.length === 4) return head[0].alpha < 1 ? 'running:rest' : 'running:on';
  return head[0].fill === BRAND_HEX.alarm ? 'blocked' : 'clear';
}

let painted: Op[] = [];

beforeEach(() => {
  painted = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const { ctx, ops } = fakeContext();
    painted = ops;
    const original = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x: number, y: number, w: number, h: number) => {
      if (x === 0 && y === 0 && w === 32 && h === 32) ops.length = 0; // a new frame starts with the tile
      original(x, y, w, h);
    };
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

  it('fills a solid --ink-0 tile first (never transparent), then the bars in --signal', () => {
    const ops = paint('clear');
    expect(ops[0]).toMatchObject({ x: 0, y: 0, w: 32, h: 32, fill: BRAND_HEX.ink0 });
    expect(ops.slice(1).every((op) => op.fill === BRAND_HEX.signal)).toBe(true);
    expect(ops).toHaveLength(1 + 4 + 1); // tile, the hollow base bar, the solid head bar
  });

  it('turns only the head bar --alarm when blocked', () => {
    const ops = paint('blocked');
    expect(ops.slice(1, 5).every((op) => op.fill === BRAND_HEX.signal)).toBe(true);
    expect(ops[5].fill).toBe(BRAND_HEX.alarm);
  });

  it('draws the running head bar hollow, dimmed to 0.35 on the dip', () => {
    const on = paint('running', 'on');
    const rest = paint('running', 'rest');
    expect(on).toHaveLength(1 + 4 + 4);
    expect(on.slice(5).every((op) => op.alpha === 1)).toBe(true);
    expect(rest.slice(5).every((op) => op.alpha === 0.35)).toBe(true);
    expect(rest.slice(1, 5).every((op) => op.alpha === 1)).toBe(true);
  });
});
