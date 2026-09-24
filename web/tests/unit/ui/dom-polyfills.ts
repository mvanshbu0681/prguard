// OWNER: T1b (wave 1). The browser APIs Radix, cmdk and sonner reach for that jsdom
// does not implement. Imported first by the component tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) g.ResizeObserver = ResizeObserverStub;

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
}

export {};
