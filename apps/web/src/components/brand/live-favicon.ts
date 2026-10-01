// The live-state favicon (brand-gaps §C): during a live review the tab icon
// becomes a runtime-drawn 32×32 variant of the mark, so the run is readable
// from a background tab. Only the pupil changes:
//
//   running   the pupil is a ring, ticking at the heartbeat period (still watching)
//   clear     the pupil is solid lime (the mark at rest)
//   blocked   the pupil is solid --alarm — a 0ms flip: the eye saw the bug
//
// Drawn on the same rounded ink tile as favicon.ico ("never transparent"): the
// state colours then hold their contrast in light and dark tab strips. The
// geometry is the tile frame from ./geometry, so the live icon and the static
// one are the same drawing apart from the pupil.
//
// The tick mirrors the heartbeat dot (design §4.7 / motion §4.9.2):
//   @keyframes tick { 0%, 100% { opacity: .35 } 12% { opacity: 1 } }  on steps(1, end)
// steps(1, end) holds each keyframe interval at its STARTING value, so the dot
// sits at 0.35 for the first 12% of every period and at full brightness for the
// other 88%: a short dip on each beat, not a flash. The favicon draws exactly
// that — the dim frame at t = 0, the bright frame at 12% — steps, never easing.
// Under reduced motion (the OS preference or html[data-motion="reduced"])
// nothing redraws: the running icon is drawn once at full brightness, like the
// static heartbeat dot (motion §5).
//
// Framework-free so it is testable and reusable; useLiveFavicon is the React
// binding. Every DOM access is guarded: without a 2D canvas it does nothing and
// the static favicon stays, degraded, never broken.
import { MARK_LID_POINTS, TILE_RADIUS, markGeometry, type MarkLiveState } from './geometry';
import { PRGUARD_HEX } from './palette';

export type LiveFaviconState = MarkLiveState | null;

export const LIVE_FAVICON_SIZE = 32;
/** Matches --heartbeat-period and the API's heartbeat interval. Override per run with `periodMs`. */
export const HEARTBEAT_PERIOD_MS = 1200;
/** @keyframes tick on steps(1, end): the dim interval is the first 12% of each period… */
export const HEARTBEAT_DIP_FRACTION = 0.12;
/** …at opacity 0.35; the remaining 88% is full brightness. */
export const HEARTBEAT_REST_OPACITY = 0.35;

type Beat = 'on' | 'rest';

/** Small form, like favicon.ico: the tab shows this 32px frame at 16 CSS px. */
const GEOMETRY = markGeometry(LIVE_FAVICON_SIZE, { frame: 'tile', form: 'small' });

/** Paint one frame: the ink tile, the lid, and the pupil in its live state. */
export function paintLiveFavicon(ctx: CanvasRenderingContext2D, state: MarkLiveState, beat: Beat = 'on') {
  const g = GEOMETRY;
  const k = g.size / g.box.side;
  const { start, control, corner, vertex, tail } = MARK_LID_POINTS;
  const { cx, cy, r } = g.pupil;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, g.size, g.size);
  ctx.fillStyle = PRGUARD_HEX.ink;
  ctx.beginPath();
  ctx.roundRect(0, 0, g.size, g.size, g.size * TILE_RADIUS);
  ctx.fill();

  // Artboard units from here on.
  ctx.setTransform(k, 0, 0, k, -g.box.x * k, -g.box.y * k);
  ctx.strokeStyle = PRGUARD_HEX.lime;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = g.stroke;
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.quadraticCurveTo(control[0], control[1], corner[0], corner[1]);
  ctx.lineTo(vertex[0], vertex[1]);
  ctx.lineTo(tail[0], tail[1]);
  ctx.stroke();

  ctx.beginPath();
  if (state === 'running') {
    ctx.globalAlpha = beat === 'on' ? 1 : HEARTBEAT_REST_OPACITY;
    ctx.lineWidth = g.stroke / 1.75;
    ctx.arc(cx, cy, r - g.stroke / 3.5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = state === 'blocked' ? PRGUARD_HEX.alarm : PRGUARD_HEX.lime;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
  const dipFor = Math.round(period * HEARTBEAT_DIP_FRACTION);

  let saved: SavedLink[] | null = null;
  let created: HTMLLinkElement | null = null;
  let current: LiveFaviconState = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let lift: ReturnType<typeof setTimeout> | null = null;
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
    if (lift !== null) clearTimeout(lift);
    interval = null;
    lift = null;
  };

  const draw = (state: MarkLiveState, beat: Beat) => {
    const url = frame(state, beat);
    if (url) show(url);
  };

  // One period: dim at 0%, bright from 12% until the next beat (see the header).
  const beat = () => {
    draw('running', 'rest');
    if (lift !== null) clearTimeout(lift);
    lift = setTimeout(() => draw('running', 'on'), dipFor);
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
