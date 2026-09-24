// OWNER: t10 (wave 2). jsdom does not implement ResizeObserver, which Recharts'
// <ResponsiveContainer> needs to mount, and jsdom's layout engine always
// measures every element at 0×0 — a real 0×0 container never renders its
// children, so a chart that only fails under jsdom would pass a browser and
// still leave this suite blind to it. Both are the standard recharts-under-jsdom
// workaround; the chart tests import this file first.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) g.ResizeObserver = ResizeObserverStub;

if (typeof Element !== "undefined") {
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 600, width: 600, height: 400, toJSON: () => "" }) as DOMRect;
}

export {};
