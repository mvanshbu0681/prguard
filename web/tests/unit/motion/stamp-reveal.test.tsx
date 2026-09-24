// OWNER: T3. The stamp (controlled and imperative), the restartable helpers, reveals,
// the document revealer and the pooled in-view observer.
import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ANIM_IN_ATTR } from "@/motion/handshake";
import { onceInView } from "@/motion/in-view";
import { pendingReveals, REVEAL_INDEX_VAR, replayReveal, revealNow, showStatic, startAutoReveal, stopAutoReveal } from "@/motion/reveal";
import { retrigger, retriggerAll, settle, useStamp } from "@/motion/stamp";
import { installIntersectionObserver, MockIntersectionObserver, observerOf } from "./helpers";

describe("retrigger / settle", () => {
  it("flips a ↔ b so the CSS animation restarts; rest or absent starts at a", () => {
    const el = document.createElement("span");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("a");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("b");
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("a");
    settle(el, "data-stamp");
    expect(el.getAttribute("data-stamp")).toBe("rest"); // never removed: a bare .stamp would stamp again
    retrigger(el);
    expect(el.getAttribute("data-stamp")).toBe("a");
    retrigger(el, "data-draw");
    expect(el.getAttribute("data-draw")).toBe("a");
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
  const stamp = useStamp(status);
  return (
    <>
      <span className="stamp" data-stamp={stamp} data-state={status} data-testid="chip">
        {status}
      </span>
      <button onClick={() => setStatus("proven")}>proven</button>
      <button onClick={() => setStatus("disproven")}>disproven</button>
      <button onClick={() => setStatus((s) => s)}>same</button>
    </>
  );
}

describe("useStamp", () => {
  it("rests on the first render, then alternates a / b on every change, in the same commit as the colour", () => {
    const { getByTestId, getByText } = render(<Verdict />);
    const chip = getByTestId("chip");
    expect(chip.getAttribute("data-stamp")).toBe("rest");
    fireEvent.click(getByText("same"));
    expect(chip.getAttribute("data-stamp")).toBe("rest");
    fireEvent.click(getByText("proven"));
    expect([chip.getAttribute("data-state"), chip.getAttribute("data-stamp")]).toEqual(["proven", "a"]);
    fireEvent.click(getByText("disproven"));
    expect([chip.getAttribute("data-state"), chip.getAttribute("data-stamp")]).toEqual(["disproven", "b"]);
    fireEvent.click(getByText("proven"));
    expect(chip.getAttribute("data-stamp")).toBe("a");
  });
});

describe("reveals", () => {
  it("revealNow sets data-anim-in and a stagger index capped at the 6th item", () => {
    const els = Array.from({ length: 8 }, () => document.createElement("li"));
    els.forEach((el, i) => revealNow(el, i));
    expect(els.every((el) => el.getAttribute(ANIM_IN_ATTR) === "")).toBe(true);
    expect(els.map((el) => el.style.getPropertyValue(REVEAL_INDEX_VAR))).toEqual(["0", "1", "2", "3", "4", "5", "5", "5"]);
    const odd = document.createElement("li");
    revealNow(odd, Number.NaN);
    expect(odd.style.getPropertyValue(REVEAL_INDEX_VAR)).toBe("0");
  });

  it("showStatic reveals without animating", () => {
    const el = document.createElement("li");
    showStatic(el);
    expect(el.getAttribute(ANIM_IN_ATTR)).toBe("static");
  });

  it("replayReveal hides then reveals again with fresh batch indices", () => {
    const els = [document.createElement("li"), document.createElement("li")];
    els.forEach((el) => {
      el.setAttribute(ANIM_IN_ATTR, "static");
      el.style.setProperty(REVEAL_INDEX_VAR, "4");
    });
    replayReveal(els);
    expect(els.map((el) => [el.getAttribute(ANIM_IN_ATTR), el.style.getPropertyValue(REVEAL_INDEX_VAR)])).toEqual([
      ["", "0"],
      ["", "1"],
    ]);
  });
});

describe("the document revealer", () => {
  let uninstall: () => void;
  beforeEach(() => {
    uninstall = installIntersectionObserver();
  });
  afterEach(() => {
    stopAutoReveal();
    document.body.innerHTML = "";
    uninstall();
  });

  const item = (id: string, attrs = "data-anim") => `<li id="${id}" ${attrs} class="reveal">${id}</li>`;
  const byId = (id: string) => document.getElementById(id)!;
  /** Let the MutationObserver deliver its records. */
  const flush = () => act(async () => void (await Promise.resolve()));

  it("reveals every pending [data-anim] element once, batched and ordered by position", () => {
    document.body.innerHTML = `<ul>${item("a")}${item("b")}${item("c")}${item("done", 'data-anim data-anim-in="static"')}</ul>`;
    startAutoReveal();
    expect(pendingReveals()).toBe(3);
    const io = observerOf(byId("a"));
    expect(io.rootMargin).toBe("0px 0px -16% 0px"); // top crosses 84% of the viewport (§4.5)
    expect(io.targets.has(byId("done"))).toBe(false);
    io.enter([byId("b"), byId("a")], [120, 40]);
    expect(["a", "b", "c"].map((id) => byId(id).getAttribute(ANIM_IN_ATTR))).toEqual(["", "", null]);
    expect(["a", "b"].map((id) => byId(id).style.getPropertyValue(REVEAL_INDEX_VAR))).toEqual(["0", "1"]);
    expect(pendingReveals()).toBe(1);
  });

  it("is one revealer per document", () => {
    const stop = startAutoReveal();
    expect(startAutoReveal()).toBe(stop);
  });

  it("picks up content mounted later, and lets go of content removed before it was seen", async () => {
    startAutoReveal();
    expect(pendingReveals()).toBe(0);
    const list = document.createElement("ul");
    list.innerHTML = item("late1") + item("late2");
    document.body.append(list);
    await flush();
    expect(pendingReveals()).toBe(2);
    byId("late2").remove();
    await flush();
    expect(pendingReveals()).toBe(1);
    const plain = document.createElement("p");
    plain.id = "flag";
    document.body.append(plain);
    await flush();
    plain.setAttribute("data-anim", "");
    await flush();
    expect(pendingReveals()).toBe(2);
    observerOf(byId("late1")).enter([byId("late1"), byId("flag")]);
    expect([byId("late1"), byId("flag")].map((el) => el.getAttribute(ANIM_IN_ATTR))).toEqual(["", ""]);
  });

  it("shows content already scrolled past as it is (static), and keeps waiting for content below", () => {
    document.body.innerHTML = `<ul>${item("above")}${item("below")}</ul>`;
    startAutoReveal();
    const io = observerOf(byId("above"));
    io.outside([byId("above"), byId("below")], [-400, 1400]);
    expect(byId("above").getAttribute(ANIM_IN_ATTR)).toBe("static");
    expect(byId("below").hasAttribute(ANIM_IN_ATTR)).toBe(false);
    expect(pendingReveals()).toBe(1);
  });

  it("stop releases every observer", () => {
    document.body.innerHTML = `<ul>${item("a")}</ul>`;
    startAutoReveal();
    const io = observerOf(byId("a"));
    stopAutoReveal();
    expect(io.targets.size).toBe(0);
    expect(pendingReveals()).toBe(0);
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
    io.enter([b, a], [200, 100]); // b is lower on screen, so a is index 0
    expect(order).toEqual(["a0", "b1"]);
    io.enter([a]); // once only
    expect(order).toEqual(["a0", "b1"]);
    stopC();
    expect(io.disconnected).toBe(true);
  });

  it("fires for content above the viewport only when asked (passed: reveals, never autoplay)", () => {
    const [a, b] = [document.createElement("div"), document.createElement("div")];
    const seen: string[] = [];
    onceInView(a, () => seen.push("a"));
    onceInView(b, () => seen.push("b"), { passed: true });
    expect(observerOf(a)).not.toBe(observerOf(b));
    observerOf(a).outside([a], [-400]);
    observerOf(b).outside([b], [-400]);
    expect(seen).toEqual(["b"]);
  });

  it("calls back at once where IntersectionObserver is missing: visibility is never gated", () => {
    uninstall();
    const seen: number[] = [];
    onceInView(document.createElement("div"), (_e, i) => seen.push(i));
    expect(seen).toEqual([0]);
    uninstall = installIntersectionObserver();
  });
});
