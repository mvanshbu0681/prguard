// OWNER: T3. The draw measurement's fallbacks and wiring (the real geometry is measured
// in Chromium by handshake.browser.test.ts: jsdom has no SVG geometry).
import { describe, expect, it } from "vitest";
import { DRAW_LEN_VAR, drawLength, fitDraw } from "@/motion/draw";
import { revealNow } from "@/motion/reveal";
import { retrigger } from "@/motion/stamp";

const SVG = "http://www.w3.org/2000/svg";
const path = (cls = "draw") => {
  const el = document.createElementNS(SVG, "path");
  el.setAttribute("class", cls);
  el.setAttribute("pathLength", "1");
  return el;
};

describe("drawLength", () => {
  it("is 1 where there is no geometry to measure", () => {
    expect(drawLength(document.createElement("div"))).toBe(1);
    expect(drawLength(path())).toBe(1); // jsdom: no getTotalLength
  });
});

describe("fitDraw", () => {
  it("writes --draw-len on the path itself, or on every .draw path inside a container", () => {
    const one = path();
    fitDraw(one);
    expect(one.style.getPropertyValue(DRAW_LEN_VAR)).toBe("1");
    const svg = document.createElementNS(SVG, "svg");
    const [a, b, other] = [path(), path(), path("rail")];
    svg.append(a, b, other);
    fitDraw(svg);
    expect([a, b, other].map((p) => p.style.getPropertyValue(DRAW_LEN_VAR))).toEqual(["1", "1", ""]);
  });

  it("runs before every draw starts: retrigger(el, 'data-draw') and the revealer", () => {
    const replayed = path();
    retrigger(replayed, "data-draw");
    expect(replayed.style.getPropertyValue(DRAW_LEN_VAR)).toBe("1");
    const revealed = path();
    revealNow(revealed, 2);
    expect(revealed.style.getPropertyValue(DRAW_LEN_VAR)).toBe("1");
    const stamp = document.createElement("span");
    retrigger(stamp, "data-stamp");
    expect(stamp.style.getPropertyValue(DRAW_LEN_VAR)).toBe(""); // only draws are measured
  });
});
