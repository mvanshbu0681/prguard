// OWNER: t8a (wave 3). useActiveSection: jsdom has no IntersectionObserver,
// so this stands one up by hand — a minimal stub the hook can drive and this
// test can fire manually, mirroring the pattern the codebase already uses
// for ResizeObserver (tests/unit/ui/dom-polyfills.ts).
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveSection } from "@/components/marketing-shell/useActiveSection";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: Callback;
  observed: Element[] = [];
  constructor(callback: Callback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.observed = [];
  }
  takeRecords() {
    return [];
  }
}

function Probe({ ids, onActive }: { ids: string[]; onActive: (id: string) => void }) {
  const active = useActiveSection(ids);
  onActive(active);
  return null;
}

describe("useActiveSection", () => {
  const realIO = globalThis.IntersectionObserver;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
  });

  afterEach(() => {
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO;
  });

  it("defaults to the first id before anything intersects", () => {
    const seen: string[] = [];
    const a = document.createElement("section");
    a.id = "proof";
    document.body.appendChild(a);

    render(<Probe ids={["proof", "severity"]} onActive={(id) => seen.push(id)} />);

    expect(seen.at(-1)).toBe("proof");
    document.body.removeChild(a);
  });

  it("switches to the LAST id (document order) currently touching the strip", () => {
    const seen: string[] = [];
    const proof = document.createElement("section");
    proof.id = "proof";
    const severity = document.createElement("section");
    severity.id = "severity";
    document.body.append(proof, severity);

    render(<Probe ids={["proof", "severity"]} onActive={(id) => seen.push(id)} />);

    const observer = FakeIntersectionObserver.instances.at(-1)!;
    // Both still touch the thin strip (a fast scroll mid-transition); the
    // later section in document order wins, not whichever has more overlap —
    // a short early section must not out-rank a section that has already
    // reached the header line underneath it.
    act(() => {
      observer.callback([
        { target: proof, isIntersecting: true },
        { target: severity, isIntersecting: true },
      ]);
    });
    expect(seen.at(-1)).toBe("severity");

    // proof leaves the strip entirely; severity alone remains active.
    act(() => {
      observer.callback([{ target: proof, isIntersecting: false }]);
    });
    expect(seen.at(-1)).toBe("severity");

    document.body.removeChild(proof);
    document.body.removeChild(severity);
  });

  it("keeps the previous active id when nothing currently touches the strip", () => {
    const seen: string[] = [];
    const proof = document.createElement("section");
    proof.id = "proof";
    const severity = document.createElement("section");
    severity.id = "severity";
    document.body.append(proof, severity);

    render(<Probe ids={["proof", "severity"]} onActive={(id) => seen.push(id)} />);
    const observer = FakeIntersectionObserver.instances.at(-1)!;

    act(() => {
      observer.callback([{ target: severity, isIntersecting: true }]);
    });
    expect(seen.at(-1)).toBe("severity");

    act(() => {
      observer.callback([{ target: severity, isIntersecting: false }]);
    });
    expect(seen.at(-1)).toBe("severity");

    document.body.removeChild(proof);
    document.body.removeChild(severity);
  });

  it("disconnects the observer on unmount", () => {
    const el = document.createElement("section");
    el.id = "proof";
    document.body.appendChild(el);

    const { unmount } = render(<Probe ids={["proof"]} onActive={() => {}} />);
    const observer = FakeIntersectionObserver.instances.at(-1)!;
    const disconnect = vi.spyOn(observer, "disconnect");
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });
});
