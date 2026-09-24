// OWNER: t10 (wave 2). jsdom does not implement ResizeObserver, which Recharts'
// <ResponsiveContainer> needs to mount; the chart tests import this first.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) g.ResizeObserver = ResizeObserverStub;

export {};
