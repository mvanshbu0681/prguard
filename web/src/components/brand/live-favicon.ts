// OWNER: t1a (wave 1).
//
// The live-state favicon (brand-gaps §C): during a live review the tab icon
// becomes a runtime-drawn 32×32 variant of the mark, so the run is readable
// from a background tab.
//
//   running   head bar hollow (--signal outline), ticking at the heartbeat period
//   clear     both bars --signal, head solid (the mark at rest)
//   blocked   head bar solid --alarm — the head bar's fill is a 0ms flip
//
// Drawn on a solid --ink-0 tile, like favicon.ico ("never transparent"): the
// state colours then hold their designed contrast in light and dark tab strips.
// The geometry is the 16px two-bar favicon form at 2x (./geometry), so the live
// icon and the static one are the same pixels apart from the head bar.
//
// The tick mirrors the heartbeat dot (design §4.7, @keyframes tick): full
// brightness for the first 12% of each period, then 0.35 until the next beat —
// steps, not easing. Under reduced motion (the OS preference or
// html[data-motion="reduced"]) nothing redraws: the running icon is drawn once
// at full brightness, like the static heartbeat dot.
//
// Framework-free so it is testable and reusable; useLiveFavicon is the React
// binding. Every DOM access is guarded: without a 2D canvas it does nothing and
// the static favicon stays, degraded, never broken.
import { hollowRects, markGeometry, scaleGeometry, type Box, type MarkLiveState } from './geometry';
import { BRAND_HEX } from './palette';

export type LiveFaviconState = MarkLiveState | null;

export const LIVE_FAVICON_SIZE = 32;
/** Matches --heartbeat-period and the API's heartbeat interval. Override per run with `periodMs`. */
export const HEARTBEAT_PERIOD_MS = 1200;
/** @keyframes tick: bright from 0% to 12% of the period… */
export const HEARTBEAT_ON_FRACTION = 0.12;
/** …then resting at opacity 0.35. */
export const HEARTBEAT_REST_OPACITY = 0.35;

type Beat = 'on' | 'rest';

/** The 16px favicon form drawn into the 32×32 frame. */
const GEOMETRY = scaleGeometry(markGeometry(16, { form: 'two-bars' }), LIVE_FAVICON_SIZE / 16);

function fillHollow(ctx: CanvasRenderingContext2D, box: Box, s: number) {
  for (const r of hollowRects(box, s)) ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Paint one frame. The geometry has no radii at this size, so plain rects are exact. */
export function paintLiveFavicon(ctx: CanvasRenderingContext2D, state: MarkLiveState, beat: Beat = 'on') {
  const g = GEOMETRY;
  const s = g.base.stroke;
  ctx.globalAlpha = 1;
  ctx.fillStyle = BRAND_HEX.ink0;
  ctx.fillRect(0, 0, g.size, g.size);

  ctx.fillStyle = BRAND_HEX.signal;
  fillHollow(ctx, g.base, s);

  if (state === 'running') {
    ctx.globalAlpha = beat === 'on' ? 1 : HEARTBEAT_REST_OPACITY;
    fillHollow(ctx, g.head, s);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = state === 'blocked' ? BRAND_HEX.alarm : BRAND_HEX.signal;
  ctx.fillRect(g.head.x, g.head.y, g.head.w, g.head.h);
}

export function prefersReducedMotion(doc: Document = document): boolean {
  if (doc.documentElement?.getAttribute('data-motion') === 'reduced') return true;
  const view = doc.defaultView;
  return typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface SavedLink {
  el: HTMLLinkElement;
  href: string | null;
  type: string | null;
  sizes: string | null;
}

export interface LiveFaviconController {
  /** Show a state, or null to put the original icons back. */
  set(state: LiveFaviconState): void;
  /** Stop the heartbeat, restore the original icons, drop every listener. */
  destroy(): void;
}

export interface LiveFaviconOptions {
  doc?: Document;
  /** Heartbeat period in ms. Default HEARTBEAT_PERIOD_MS (1200). */
  periodMs?: number;
}

/** `rel` is a case-insensitive token list; "apple-touch-icon" is its own token and is left alone. */
function iconLinks(doc: Document): HTMLLinkElement[] {
  return Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel]')).filter((el) =>
    (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('icon'),
  );
}

function restoreAttr(el: Element, name: string, value: string | null) {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

export function createLiveFavicon(options: LiveFaviconOptions = {}): LiveFaviconController {
  const doc = options.doc ?? (typeof document === 'undefined' ? undefined : document);
  const period = Math.max(240, options.periodMs ?? HEARTBEAT_PERIOD_MS);
  const onFor = Math.round(period * HEARTBEAT_ON_FRACTION);

  let saved: SavedLink[] | null = null;
  let created: HTMLLinkElement | null = null;
  let current: LiveFaviconState = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let rest: ReturnType<typeof setTimeout> | null = null;
  let ctx: CanvasRenderingContext2D | null | undefined;
  let canvas: HTMLCanvasElement | null = null;
  const urls = new Map<string, string>();
  const cleanups: (() => void)[] = [];

  const context = () => {
    if (ctx !== undefined || !doc) return ctx ?? null;
    canvas = doc.createElement('canvas');
    canvas.width = LIVE_FAVICON_SIZE;
    canvas.height = LIVE_FAVICON_SIZE;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const frame = (state: MarkLiveState, beat: Beat): string | null => {
    const key = `${state}:${beat}`;
    const hit = urls.get(key);
    if (hit) return hit;
    const c = context();
    if (!c || !canvas) return null;
    paintLiveFavicon(c, state, beat);
    const url = canvas.toDataURL('image/png');
    urls.set(key, url);
    return url;
  };

  const show = (url: string) => {
    if (!doc) return;
    // Re-scanned on every frame: if React replaces a metadata <link> mid-run,
    // the new element's original attributes are captured too, and restored.
    const known = (saved ??= []);
    for (const el of iconLinks(doc)) {
      if (el === created || known.some((s) => s.el === el)) continue;
      known.push({ el, href: el.getAttribute('href'), type: el.getAttribute('type'), sizes: el.getAttribute('sizes') });
    }
    if (known.length === 0 && !created && doc.head) {
      created = doc.createElement('link');
      created.setAttribute('rel', 'icon');
      created.setAttribute('data-live-favicon', '');
      doc.head.append(created);
    }
    const targets = created ? [created] : known.map((s) => s.el);
    for (const el of targets) {
      el.setAttribute('href', url);
      el.setAttribute('type', 'image/png');
      el.setAttribute('sizes', `${LIVE_FAVICON_SIZE}x${LIVE_FAVICON_SIZE}`);
    }
  };

  const restore = () => {
    if (saved) {
      for (const s of saved) {
        restoreAttr(s.el, 'href', s.href);
        restoreAttr(s.el, 'type', s.type);
        restoreAttr(s.el, 'sizes', s.sizes);
      }
    }
    created?.remove();
    created = null;
    saved = null;
  };

  const stopBeat = () => {
    if (interval !== null) clearInterval(interval);
    if (rest !== null) clearTimeout(rest);
    interval = null;
    rest = null;
  };

  const draw = (state: MarkLiveState, beat: Beat) => {
    const url = frame(state, beat);
    if (url) show(url);
  };

  const beat = () => {
    draw('running', 'on');
    if (rest !== null) clearTimeout(rest);
    rest = setTimeout(() => draw('running', 'rest'), onFor);
  };

  const set = (state: LiveFaviconState) => {
    current = state;
    stopBeat();
    if (state === null) {
      restore();
      return;
    }
    if (state === 'running' && doc && !prefersReducedMotion(doc)) {
      beat();
      interval = setInterval(beat, period);
      return;
    }
    draw(state, 'on');
  };

  // Reduced motion can change mid-run (OS setting, or the footer toggle writing
  // html[data-motion]). Re-apply the current state when it does.
  if (doc) {
    const view = doc.defaultView;
    if (typeof view?.matchMedia === 'function') {
      const mq = view.matchMedia('(prefers-reduced-motion: reduce)');
      const onChange = () => set(current);
      mq.addEventListener?.('change', onChange);
      cleanups.push(() => mq.removeEventListener?.('change', onChange));
    }
    if (typeof view?.MutationObserver === 'function' && doc.documentElement) {
      const mo = new view.MutationObserver(() => set(current));
      mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
      cleanups.push(() => mo.disconnect());
    }
  }

  return {
    set,
    destroy() {
      stopBeat();
      restore();
      current = null;
      while (cleanups.length) cleanups.pop()!();
    },
  };
}
