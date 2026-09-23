// OWNER: T3. The restartable helpers (stamp / draw / scan), reveals and the
// pooled in-view observer.
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANIM_IN_ATTR } from "@/motion/handshake";
import { onceInView } from "@/motion/in-view";
import { REVEAL_INDEX_VAR, replayReveal, revealNow, useReveal } from "@/motion/reveal";
import { retrigger, retriggerAll, settle, useStamp } from "@/motion/stamp";
import { installIntersectionObserver, MockIntersectionObserver, observerOf } from "./helpers";

describe("retrigger", () => {
  it("flips a ↔ b so the CSS animation restarts", () => {
    const el = document.createElement("span");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("a");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("b");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("a");
    retrigger(el, "data-draw");
    expect(el.getAttribute("data-draw")).toBe("a");
    settle(el, "data-draw");
    expect(el.hasAttribute("data-draw")).toBe(false);
  });

  it("retriggerAll restarts every match", () => {
    const root = document.createElement("div");
    root.innerHTML = `<path class="draw"></path><path class="draw" data-draw="a"></path><path></path>`;
    retriggerAll(root, ".draw", "data-draw");
    expect([...root.querySelectorAll("path")].map((p) => p.getAttribute("data-draw"))).toEqual(["a", "b", null]);
  });
});

function Verdict() {
  const [status, setStatus] = useState("not_attempted");
  const ref = useStamp<HTMLSpanElement>(status);
  return (
    <>
      <span ref={ref} className="stamp" data-state={status} data-testid="chip">
        {status}
      </span>
      <button onClick={() => setStatus("proven")}>proven</button>
      <button onClick={() => setStatus("disproven")}>disproven</button>
      <button onClick={() => setStatus((s) => s)}>same</button>
    </>
  );
}

describe("useStamp", () => {
  it("never stamps on the first render, then stamps on every change", () => {
    const { getByTestId, getByText } = render(<Verdict />);
    const chip = getByTestId("chip");
    expect(chip.hasAttribute("data-stamp")).toBe(false);
    fireEvent.click(getByText("same"));
    expect(chip.hasAttribute("data-stamp")).toBe(false);
    fireEvent.click(getByText("proven"));
    expect(chip.getAttribute("data-state")).toBe("proven");
    expect(chip.getAttribute("data-stamp")).toBe("a");
    fireEvent.click(getByText("disproven"));
    expect(chip.getAttribute("data-stamp")).toBe("b");
  });
});

describe("reveals", () => {
  it("revealNow sets data-anim-in and a stagger index capped at the 6th item", () => {
    const els = Array.from({ length: 8 }, () => document.createElement("li"));
    els.forEach((el, i) => revealNow(el, i));
    expect(els.every((el) => el.hasAttribute(ANIM_IN_ATTR))).toBe(true);
    expect(els.map((el) => el.style.getPropertyValue(REVEAL_INDEX_VAR))).toEqual(["0", "1", "2", "3", "4", "5", "5", "5"]);
  });

  it("replayReveal hides then reveals again with fresh batch indices", () => {
    const els = [document.createElement("li"), document.createElement("li")];
    els.forEach((el) => {
      el.setAttribute(ANIM_IN_ATTR, "");
      el.style.setProperty(REVEAL_INDEX_VAR, "4");
    });
    replayReveal(els);
    expect(els.map((el) => [el.hasAttribute(ANIM_IN_ATTR), el.style.getPropertyValue(REVEAL_INDEX_VAR)])).toEqual([
      [true, "0"],
      [true, "1"],
    ]);
  });
});

describe("in view", () => {
  let uninstall: () => void;
  beforeEach(() => {
    uninstall = installIntersectionObserver();
  });
  afterEach(() => uninstall());

  it("shares one observer per option set and batches simultaneous entries by position", () => {
    const [a, b, c] = [document.createElement("div"), document.createElement("div"), document.createElement("div")];
    const order: string[] = [];
    onceInView(a, (_e, i) => order.push(`a${i}`));
    onceInView(b, (_e, i) => order.push(`b${i}`));
    const stopC = onceInView(c, () => order.push("c"));
    const io = observerOf(a);
    expect(observerOf(b)).toBe(io);
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(io.rootMargin).toBe("0px 0px -16% 0px"); // top crosses 84% of the viewport (§4.5)
    io.enter([b, a], [200, 100]); // b is lower on screen, so a is index 0
    expect(order).toEqual(["a0", "b1"]);
    io.enter([a]); // once only
    expect(order).toEqual(["a0", "b1"]);
    stopC();
    expect(io.disconnected).toBe(true);
  });

  it("calls back at once where IntersectionObserver is missing: visibility is never gated", () => {
    uninstall();
    const seen: number[] = [];
    onceInView(document.createElement("div"), (_e, i) => seen.push(i));
    expect(seen).toEqual([0]);
    uninstall = installIntersectionObserver();
  });

  function Cards({ n }: { n: number }) {
    const reveal = useReveal<HTMLLIElement>();
    return (
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <li key={i} ref={reveal} data-anim="" className="reveal" data-testid={`card-${i}`}>
            card {i}
          </li>
        ))}
      </ul>
    );
  }

  it("useReveal reveals each element once, staggered within its batch, and unobserves on unmount", () => {
    const { getByTestId, unmount } = render(<Cards n={3} />);
    const cards = [0, 1, 2].map((i) => getByTestId(`card-${i}`));
    expect(cards.some((c) => c.hasAttribute(ANIM_IN_ATTR))).toBe(false);
    const io = observerOf(cards[0]);
    io.enter([cards[1], cards[0]], [10, 0]);
    expect(cards.map((c) => c.getAttribute(ANIM_IN_ATTR))).toEqual(["", "", null]);
    expect(cards.map((c) => c.style.getPropertyValue(REVEAL_INDEX_VAR))).toEqual(["0", "1", ""]);
    unmount();
    expect(io.targets.size).toBe(0);
  });
});
