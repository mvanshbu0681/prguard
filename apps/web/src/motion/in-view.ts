// OWNER: T3 (wave 1). "Once in view" for reveals and in-view autoplay.
//
// One IntersectionObserver per (threshold, rootMargin) pair is shared by every
// target on the page (motion spec §4.5: one batched trigger, never one per card).
// Targets that cross in the same observer callback form one batch, ordered by
// on-screen position, and each receives its index in that batch, so a row of cards
// that enters together staggers exactly like ScrollTrigger.batch.
//
// Visibility is never gated on this: where IntersectionObserver is missing, the
// callback runs immediately.
//
// Engine-free.

export interface InViewOptions {
  /** Fraction of the target that must be visible (0…1). */
  threshold?: number;
  /** Margin around the viewport, CSS syntax. The default fires when the top crosses 84% of the viewport (§4.5). */
  rootMargin?: string;
  /**
   * Also fire for a target that lies wholly ABOVE the viewport (already scrolled past:
   * a reload with restored scroll, an anchor jump to #run). Reveals use it, so content
   * the reader has passed is never left hidden (and unfindable with Cmd-F) behind them.
   */
  passed?: boolean;
}

export type InViewCallback = (entry: IntersectionObserverEntry | null, batchIndex: number) => void;

/** §4.5: `start: 'top 84%'`: the element's top crosses 84% of the viewport height. */
export const REVEAL_ROOT_MARGIN = "0px 0px -16% 0px";

interface Pool {
  observer: IntersectionObserver;
  callbacks: Map<Element, InViewCallback>;
}

const pools = new Map<string, Pool>();

/** True when the entry's target sits wholly above the observer's root (scrolled past). */
export function isPassed(entry: IntersectionObserverEntry): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
}

const poolKey = (threshold: number, rootMargin: string, passed: boolean) => `${threshold}|${rootMargin}|${passed ? "passed" : ""}`;

function poolFor(threshold: number, rootMargin: string, passed: boolean): Pool {
  const key = poolKey(threshold, rootMargin, passed);
  let pool = pools.get(key);
  if (pool) return pool;
  const callbacks = new Map<Element, InViewCallback>();
  const observer = new IntersectionObserver(
    (entries) => {
      const entering = entries
        .filter((e) => (e.isIntersecting || (passed && isPassed(e))) && callbacks.has(e.target))
        .sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top || x.boundingClientRect.left - y.boundingClientRect.left);
      entering.forEach((entry, index) => {
        const cb = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer.unobserve(entry.target);
        cb?.(entry, index);
      });
      if (callbacks.size === 0) {
        observer.disconnect();
        pools.delete(key);
      }
    },
    { threshold, rootMargin },
  );
  pool = { observer, callbacks };
  pools.set(key, pool);
  return pool;
}

/**
 * Call `callback` once, the first time `el` enters the viewport. Returns an
 * unsubscribe function (safe to call after it fired).
 */
export function onceInView(el: Element, callback: InViewCallback, options: InViewOptions = {}): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback(null, 0);
    return () => {};
  }
  const threshold = options.threshold ?? 0;
  const rootMargin = options.rootMargin ?? REVEAL_ROOT_MARGIN;
  const passed = options.passed ?? false;
  const pool = poolFor(threshold, rootMargin, passed);
  pool.callbacks.set(el, callback);
  pool.observer.observe(el);
  return () => {
    if (!pool.callbacks.has(el)) return;
    pool.callbacks.delete(el);
    pool.observer.unobserve(el);
    if (pool.callbacks.size === 0) {
      pool.observer.disconnect();
      pools.delete(poolKey(threshold, rootMargin, passed));
    }
  };
}
