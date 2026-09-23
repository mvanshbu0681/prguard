// OWNER: t1c (wave 1). THE 0ms RULE (plan §2 hard rule 3, motion spec §2.5): a verdict or
// gate colour change has no transition at all; the chip re-mounts with the class `stamp`
// (track t3's 180ms scale(1.045) → 1). First paint never stamps.
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  DeliveryModeChip,
  GateBlock,
  GateChip,
  ProofChip,
  SeverityMeter,
  StageDot,
  StatusBadge,
  useStamp,
} from "@/components/badges";

/** One state, then another, for every stamped component. `slot` finds the element that carries the stamp. */
const CASES: { name: string; a: ReactElement; b: ReactElement; slot: string }[] = [
  { name: "ProofChip", a: <ProofChip status="not_attempted" />, b: <ProofChip status="proven" />, slot: '[data-slot="proof-chip"]' },
  { name: "GateChip", a: <GateChip conclusion={null} />, b: <GateChip conclusion="failure" />, slot: '[data-slot="gate-chip"]' },
  { name: "GateBlock", a: <GateBlock conclusion="success" announce={false} />, b: <GateBlock conclusion="failure" announce={false} />, slot: '[data-slot="gate-block-frame"]' },
  { name: "StatusBadge", a: <StatusBadge status="proposed" />, b: <StatusBadge status="published" />, slot: '[data-slot="status-badge"]' },
  { name: "DeliveryModeChip", a: <DeliveryModeChip mode="inline_exact" />, b: <DeliveryModeChip mode="file_level" />, slot: '[data-slot="delivery-mode-chip"]' },
  { name: "SeverityMeter", a: <SeverityMeter score={0.5} band="medium" />, b: <SeverityMeter score={0.81} band="critical" />, slot: '[data-slot="severity-meter"]' },
  { name: "StageDot", a: <StageDot state="running" />, b: <StageDot state="done" />, slot: '[data-slot="stage-dot-stamp"]' },
];

function allClasses(root: Element): string[] {
  return [root, ...root.querySelectorAll("*")].flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
}

describe("the 0ms rule", () => {
  it("gives no badge a colour transition: transition-none, and no transition/duration/ease utility", () => {
    for (const { name, a, b } of CASES) {
      for (const el of [a, b]) {
        const { container, unmount } = render(el);
        const classes = allClasses(container);
        expect(classes, name).toContain("transition-none");
        expect(classes.filter((c) => /^(transition(?!-none$)|duration-|ease-|delay-)/.test(c.slice(c.lastIndexOf(":") + 1))), name).toEqual([]);
        unmount();
      }
    }
  });

  it("does not stamp on first paint", () => {
    for (const { name, a, slot } of CASES) {
      const { container, unmount } = render(a);
      expect(container.querySelector(slot), name).not.toBeNull();
      expect(container.querySelector(".stamp"), name).toBeNull();
      unmount();
    }
  });

  it("re-mounts the element with the class `stamp` when the state changes, every time", () => {
    for (const { name, a, b, slot } of CASES) {
      const view = render(a);
      const first = view.container.querySelector(slot)!;
      view.rerender(b);
      const second = view.container.querySelector(slot)!;
      expect(second.classList.contains("stamp"), name).toBe(true);
      expect(second, `${name} re-mounted`).not.toBe(first);
      view.rerender(a);
      const third = view.container.querySelector(slot)!;
      expect(third.classList.contains("stamp"), name).toBe(true);
      expect(third, `${name} re-mounted again`).not.toBe(second);
      // an unrelated re-render keeps the node: the keyframe does not replay
      view.rerender(a);
      expect(view.container.querySelector(slot), `${name} stable`).toBe(third);
      view.unmount();
    }
  });

  it("stamps the StageDot inside a <g>, never on the root <svg> (§6.4 rule 4)", () => {
    const view = render(<StageDot state="pending" />);
    view.rerender(<StageDot state="failed" />);
    const svg = view.container.querySelector("svg")!;
    expect(svg.classList.contains("stamp")).toBe(false);
    const g = svg.querySelector('[data-slot="stage-dot-stamp"]')!;
    expect(g.tagName.toLowerCase()).toBe("g");
    expect(g.getAttribute("class")).toContain("[transform-box:fill-box]");
    expect(g.getAttribute("class")).toContain("origin-center");
  });

  it("server-renders every badge without a stamp", () => {
    for (const { name, a } of CASES) {
      const html = renderToStaticMarkup(a);
      // the class token `stamp`, not the data-slot name `stage-dot-stamp`
      expect(html, name).not.toMatch(/class="(?:[^"]*\s)?stamp(?:\s[^"]*)?"/);
      expect(html.length, name).toBeGreaterThan(0);
    }
  });
});

describe("useStamp", () => {
  function Probe({ value }: { value: unknown }) {
    return <output>{useStamp(value)}</output>;
  }

  it("counts changes since mount, and ignores re-renders with the same value", () => {
    const view = render(<Probe value="a" />);
    const count = () => view.container.querySelector("output")!.textContent;
    expect(count()).toBe("0");
    view.rerender(<Probe value="a" />);
    expect(count()).toBe("0");
    view.rerender(<Probe value="b" />);
    expect(count()).toBe("1");
    view.rerender(<Probe value="a" />);
    expect(count()).toBe("2");
    view.rerender(<Probe value={null} />);
    expect(count()).toBe("3");
    view.rerender(<Probe value={null} />);
    expect(count()).toBe("3");
  });
});
