// OWNER: T3. The fallback handshake's markup and markAnimReady's contract. The CSS
// timing itself (hidden → visible at 1600ms) is proven in a real browser in
// handshake.browser.test.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANIM_LATE_CLASS,
  ANIM_READY_CLASS,
  AnimHandshake,
  FORCE_REVEAL_MS,
  HANDSHAKE_CSS,
  LATE_MARGIN_MS,
  NOSCRIPT_CSS,
  animReadyState,
  markAnimReady,
  onAnimReady,
} from "@/motion/handshake";

const html = document.documentElement;
afterEach(() => {
  html.classList.remove(ANIM_READY_CLASS, ANIM_LATE_CLASS);
  html.removeAttribute("data-anim-runtime");
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

  it("lets html.anim-ready disarm it and the runtime reveal it", () => {
    expect(HANDSHAKE_CSS).toContain("html.anim-ready [data-anim]{animation:none}");
    expect(HANDSHAKE_CSS).toContain("html.anim-ready [data-anim][data-anim-in]{visibility:visible}");
  });

  it("keeps a late runtime static, and prints everything", () => {
    expect(HANDSHAKE_CSS).toContain("html.anim-late [data-anim]{visibility:visible;animation:none}");
    expect(HANDSHAKE_CSS).toContain("@media print{[data-anim]{visibility:visible!important;animation:none!important}}");
  });

  it("never hides anything with JS disabled", () => {
    expect(NOSCRIPT_CSS).toBe("[data-anim]{visibility:visible!important;animation:none!important}");
  });
});

describe("markAnimReady", () => {
  it("is pending until a runtime calls it", () => {
    expect(animReadyState()).toBe("pending");
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false);
  });

  it("disarms the force-reveal when the runtime is on time", () => {
    vi.spyOn(performance, "now").mockReturnValue(420);
    expect(markAnimReady("gsap")).toBe("ready");
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(true);
    expect(html.classList.contains(ANIM_LATE_CLASS)).toBe(false);
    expect(html.getAttribute("data-anim-runtime")).toBe("gsap");
    expect(animReadyState()).toBe("ready");
  });

  it("marks the page late (static, no flash back to hidden) once the timer may have fired", () => {
    vi.spyOn(performance, "now").mockReturnValue(FORCE_REVEAL_MS - LATE_MARGIN_MS);
    expect(markAnimReady("motion")).toBe("late");
    expect(html.classList.contains(ANIM_LATE_CLASS)).toBe(true);
    expect(html.classList.contains(ANIM_READY_CLASS)).toBe(false);
  });

  it("is idempotent: the first runtime decides", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    const seen: string[] = [];
    const off = onAnimReady((state, runtime) => seen.push(`${state}:${runtime}`));
    expect(markAnimReady("gsap")).toBe("ready");
    expect(markAnimReady("motion")).toBe("ready");
    off();
    expect(seen).toEqual(["ready:gsap"]);
    expect(html.getAttribute("data-anim-runtime")).toBe("gsap");
  });
});
