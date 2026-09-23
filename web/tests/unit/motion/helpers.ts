// OWNER: T3. Test doubles jsdom does not provide: a controllable matchMedia and
// an IntersectionObserver whose intersections the test decides.

type ChangeListener = (event: { matches: boolean; media: string }) => void;

export interface MatchMediaControl {
  set(query: string, matches: boolean, options?: { dispatch?: boolean }): void;
  listenerCount(query: string): number;
  uninstall(): void;
}

export function installMatchMedia(initial: Record<string, boolean> = {}): MatchMediaControl {
  const state = new Map<string, boolean>(Object.entries(initial));
  const listeners = new Map<string, Set<ChangeListener>>();
  const bucket = (q: string) => {
    let s = listeners.get(q);
    if (!s) listeners.set(q, (s = new Set()));
    return s;
  };
  const evaluate = (q: string) => (q.trim() === "all" ? true : (state.get(q) ?? false));
  const had = Object.prototype.hasOwnProperty.call(window, "matchMedia");
  const original = window.matchMedia;
  const matchMedia = (query: string) =>
    ({
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener: (type: string, cb: ChangeListener) => {
        if (type === "change") bucket(query).add(cb);
      },
      removeEventListener: (type: string, cb: ChangeListener) => {
        if (type === "change") bucket(query).delete(cb);
      },
      addListener: (cb: ChangeListener) => bucket(query).add(cb),
      removeListener: (cb: ChangeListener) => bucket(query).delete(cb),
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
  return {
    set(query, matches, options = {}) {
      state.set(query, matches);
      if (options.dispatch) for (const cb of [...bucket(query)]) cb({ matches, media: query });
    },
    listenerCount: (query) => bucket(query).size,
    uninstall() {
      if (had) Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: original });
      else delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}

export class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly scrollMargin = "0px";
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Report `elements` as intersecting, in one callback (one batch). `tops` orders them on screen. */
  enter(elements: Element[], tops: number[] = elements.map((_, i) => i * 10)) {
    const entries = elements.map(
      (target, i) =>
        ({
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: { top: tops[i], left: 0 } as DOMRectReadOnly,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: 0,
        }) as IntersectionObserverEntry,
    );
    this.callback(entries, this);
  }
}

export function installIntersectionObserver(): () => void {
  const g = globalThis as { IntersectionObserver?: unknown };
  const original = g.IntersectionObserver;
  MockIntersectionObserver.instances = [];
  g.IntersectionObserver = MockIntersectionObserver;
  return () => {
    if (original === undefined) delete g.IntersectionObserver;
    else g.IntersectionObserver = original;
  };
}

/** The live observer watching `el`. */
export function observerOf(el: Element): MockIntersectionObserver {
  const io = MockIntersectionObserver.instances.find((o) => !o.disconnected && o.targets.has(el));
  if (!io) throw new Error("element is not observed");
  return io;
}

/** The end-frame DOM, minus animation triggers (data-stamp / data-draw / data-scan). */
export function endFrame(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const el of [clone, ...clone.querySelectorAll("*")]) for (const a of ["data-stamp", "data-draw", "data-scan"]) el.removeAttribute(a);
  return clone.outerHTML;
}
