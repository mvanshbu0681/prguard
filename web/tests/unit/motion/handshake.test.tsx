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
  FORCE_REVEAL_MS,
  HANDSHAKE_CSS,
  NOSCRIPT_CSS,
  animReadyInfo,
  animReadyState,
  isShowing,
  markAnimReady,
  onAnimReady,
} from "@/motion/handshake";
import { pendingReveals, stopAutoReveal } from "@/motion/reveal";
import { installIntersectionObserver, MockIntersectionObserver } from "./helpers";

const html = document.documentElement;

/**
 * jsdom runs no CSS animations, so `visibility` never changes by itself. Stub the
 * computed visibility per element: `shown` elements report "visible" (one of the two
 * force-reveal timers fired), the rest "hidden" (still held by the handshake).
 */
function stubVisibility(shown: Set<Element>): void {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo);
    if (!el.hasAttribute("data-anim")) return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "visibility") return shown.has(el) ? "visible" : "hidden";
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  });
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
    // Per element (design §4.7), hidden unless the page clock's inherited flag says otherwise.
    expect(HANDSHAKE_CSS).toContain("[data-anim]{visibility:var(--prg-forced,hidden);animation:prg-force-reveal 0s 1600ms forwards}");
    expect(HANDSHAKE_CSS).toContain("@keyframes prg-force-reveal{to{visibility:visible}}");
    // The page clock on <html>: covers content-visibility:auto subtrees whose own timer has not started.
    expect(HANDSHAKE_CSS).toContain("html:not(.anim-ready){animation:prg-force-reveal-page 0s 1600ms forwards}");
    expect(HANDSHAKE_CSS).toContain("@keyframes prg-force-reveal-page{to{--prg-forced:visible}}");
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

describe("isShowing", () => {
  it("reads the computed visibility the handshake produces", () => {
    const hidden = anim("hidden");
    const shown = anim("shown");
    stubVisibility(new Set([shown]));
    expect(isShowing(hidden)).toBe(false);
    expect(isShowing(shown)).toBe(true);
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
    const a = anim("a");
    const b = anim("b");
    stubVisibility(new Set()); // both still held by the handshake
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
    const shown = anim("shown"); // its force-reveal fired: visible now
    const later = anim("later"); // mounted since: still hidden
    stubVisibility(new Set([shown]));
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
