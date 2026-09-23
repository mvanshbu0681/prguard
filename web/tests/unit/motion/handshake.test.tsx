// OWNER: T3. The fallback handshake's markup and markAnimReady's contract. The CSS
// timing itself (hidden → visible at 1600ms), the late-runtime path and the revealer are
// proven in a real browser in handshake.browser.test.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANIM_IN_ATTR,
  ANIM_READY_CLASS,
  ANIM_RUNTIME_ATTR,
  AnimHandshake,
  FORCE_REVEAL_KEYFRAME,
  FORCE_REVEAL_MS,
  HANDSHAKE_CSS,
  NOSCRIPT_CSS,
  animReadyInfo,
  animReadyState,
  forceRevealFired,
  markAnimReady,
  onAnimReady,
} from "@/motion/handshake";
import { pendingReveals, stopAutoReveal } from "@/motion/reveal";
import { installIntersectionObserver, MockIntersectionObserver } from "./helpers";

const html = document.documentElement;

/** Give `el` a fake force-reveal timer at `currentTime` (jsdom has no Web Animations). */
function withTimer(el: Element, currentTime: number | null, playState: AnimationPlayState = "running"): Element {
  const timer = { animationName: FORCE_REVEAL_KEYFRAME, currentTime, playState } as unknown as CSSAnimation;
  Object.defineProperty(el, "getAnimations", { configurable: true, value: () => [timer] });
  return el;
}

function anim(id: string): HTMLElement {
  const el = document.createElement("p");
  el.id = id;
  el.setAttribute("data-anim", "");
  document.body.append(el);
  return el;
}

let uninstall: () => void;
beforeEach(() => {
  uninstall = installIntersectionObserver();
});
afterEach(() => {
  stopAutoReveal();
  html.classList.remove(ANIM_READY_CLASS);
  html.removeAttribute(ANIM_RUNTIME_ATTR);
  document.body.innerHTML = "";
  uninstall();
  vi.restoreAllMocks();
});

describe("<AnimHandshake />", () => {
  const markup = renderToStaticMarkup(<AnimHandshake />);

  it("renders the inline style and the noscript override, and no script", () => {
    expect(markup).toBe(`<style id="prg-anim-handshake">${HANDSHAKE_CSS}</style><noscript><style>${NOSCRIPT_CSS}</style></noscript>`);
    expect(markup).not.toContain("<script");
  });

  it("hides [data-anim] and force-reveals it at 1600ms (design §4.7)", () => {
    expect(FORCE_REVEAL_MS).toBe(1600);
    expect(HANDSHAKE_CSS).toContain("[data-anim]{visibility:hidden;animation:prg-force-reveal 0s 1600ms forwards}");
    expect(HANDSHAKE_CSS).toContain("@keyframes prg-force-reveal{to{visibility:visible}}");
  });

  it("lets html.anim-ready disarm it and data-anim-in reveal it", () => {
    expect(HANDSHAKE_CSS).toContain("html.anim-ready [data-anim]{animation:none}");
    expect(HANDSHAKE_CSS).toContain("html.anim-ready [data-anim][data-anim-in]{visibility:visible}");
  });

  it("prints everything, and never hides anything with JS disabled", () => {
    expect(HANDSHAKE_CSS).toContain("@media print{[data-anim]{visibility:visible!important;animation:none!important}}");
    expect(NOSCRIPT_CSS).toBe("[data-anim]{visibility:visible!important;animation:none!important}");
  });
});

describe("forceRevealFired", () => {
  it("reads the element's own timer", () => {
    expect(forceRevealFired(withTimer(document.createElement("p"), 200))).toBe(false);
    expect(forceRevealFired(withTimer(document.createElement("p"), FORCE_REVEAL_MS - 150))).toBe(false);
    expect(forceRevealFired(withTimer(document.createElement("p"), FORCE_REVEAL_MS - 50))).toBe(true); // a frame away counts as fired
    expect(forceRevealFired(withTimer(document.createElement("p"), FORCE_REVEAL_MS, "finished"))).toBe(true);
  });

  it("treats an element with no timer (not rendered) as pending", () => {
    const el = document.createElement("p");
    Object.defineProperty(el, "getAnimations", { configurable: true, value: () => [] });
    expect(forceRevealFired(el)).toBe(false);
  });

  it("falls back to the page clock without the Web Animations API", () => {
    const el = document.createElement("p");
    expect(typeof el.getAnimations).not.toBe("function"); // jsdom
    expect(forceRevealFired(el, 400)).toBe(false);
    expect(forceRevealFired(el, FORCE_REVEAL_MS)).toBe(true);
  });
});

describe("markAnimReady", () => {
  it("is pending until a runtime calls it", () => {
    expect(animReadyState()).toBe("pending");
    expect(animReadyInfo()).toBeNull();
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false);
  });

  it("disarms the force-reveal and hands every pending element to the revealer", () => {
    vi.spyOn(performance, "now").mockReturnValue(420);
    const a = withTimer(anim("a"), 380);
    const b = withTimer(anim("b"), 12);
    const ready = markAnimReady("gsap");
    expect(ready).toEqual({ runtime: "gsap", at: 420, kept: 0 });
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(true);
    expect(html.getAttribute(ANIM_RUNTIME_ATTR)).toBe("gsap");
    expect(animReadyState()).toBe("ready");
    expect(animReadyInfo()).toEqual(ready);
    expect([a, b].map((el) => el.hasAttribute(ANIM_IN_ATTR))).toEqual([false, false]); // hidden until seen
    expect(pendingReveals()).toBe(2);
    expect(MockIntersectionObserver.instances.at(-1)?.targets).toEqual(new Set([a, b]));
  });

  it("a late runtime keeps every already force-revealed element as it is (static), never re-hidden", () => {
    vi.spyOn(performance, "now").mockReturnValue(2400);
    const shown = withTimer(anim("shown"), FORCE_REVEAL_MS, "finished");
    const later = withTimer(anim("later"), 300); // mounted later: its own timer has not fired
    const ready = markAnimReady("motion");
    expect(ready?.kept).toBe(1);
    expect(shown.getAttribute(ANIM_IN_ATTR)).toBe("static");
    expect(later.hasAttribute(ANIM_IN_ATTR)).toBe(false);
    expect(pendingReveals()).toBe(1);
  });

  it("is idempotent: the first runtime decides", () => {
    const seen: string[] = [];
    const off = onAnimReady((r) => seen.push(String(r.runtime)));
    expect(markAnimReady("gsap")).not.toBeNull();
    expect(markAnimReady("motion")).toBeNull();
    off();
    expect(seen).toEqual(["gsap"]);
    expect(html.getAttribute(ANIM_RUNTIME_ATTR)).toBe("gsap");
  });

  it("the runtime name is optional", () => {
    expect(markAnimReady()?.runtime).toBeNull();
    expect(html.hasAttribute(ANIM_RUNTIME_ATTR)).toBe(false);
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(true);
  });
});
