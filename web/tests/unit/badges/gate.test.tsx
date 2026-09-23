// OWNER: t1c (wave 1). The merge gate against §1.8 / §5.4 and brand-gaps §2 ruling 2:
// --alarm is FILL-ONLY. It may paint geometry (a 2px rule, a border, the ■ glyph) but never
// the background behind text and never the text itself.
import { render } from "@testing-library/react";
import type React from "react";
import { describe, expect, it } from "vitest";
import { GateBlock, GateChip, type GateReading } from "@/components/badges";
import { colorsOf, sameLiteral, tokenFor } from "./tokens";

const READINGS: GateReading[] = ["failure", "neutral", "success", null];

/** Elements that directly hold visible text (not the sr-only prefixes). */
function textHolders(root: Element): Element[] {
  return [root, ...root.querySelectorAll("*")].filter(
    (el) => !el.closest(".sr-only") && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""),
  );
}

/** The chain of elements from `el` up to `root`, inclusive — everything that paints behind el's text. */
function behind(el: Element, root: Element): Element[] {
  const out: Element[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    out.push(n);
    if (n === root) break;
  }
  return out;
}

function assertAlarmIsFillOnly(root: Element) {
  const holders = textHolders(root);
  expect(holders.length).toBeGreaterThan(0);
  for (const el of holders) {
    for (const layer of behind(el, root)) {
      for (const c of colorsOf(layer).filter((r) => r.prop === "bg")) {
        expect(sameLiteral(c.token, "--alarm"), `${c.cls} behind "${el.textContent}"`).toBe(false);
      }
      const style = (layer as HTMLElement).style;
      expect(`${style.background}${style.backgroundColor}`, "inline background").not.toMatch(/alarm/);
    }
    // and the text colour itself: --alarm-text at chip/label sizes, never --alarm / --alarm-hi
    const fg = behind(el, root)
      .map((n) => tokenFor(n, "text"))
      .find(Boolean);
    expect(fg && (sameLiteral(fg, "--alarm") || sameLiteral(fg, "--alarm-hi")), `text colour of "${el.textContent}"`).toBe(false);
  }
}

describe("GateBlock", () => {
  it("never uses --alarm as a text background (failure)", () => {
    const { container } = render(<GateBlock conclusion="failure" blocking={1} delivery="check_run" announce={false} />);
    assertAlarmIsFillOnly(container.firstElementChild!);
  });

  it("paints BLOCKED as --alarm-text on --alarm-tint-hi, a 1px --alarm border and a 2px top rule", () => {
    const { container } = render(<GateBlock conclusion="failure" blocking={1} delivery="check_run" announce={false} />);
    const frame = container.querySelector('[data-slot="gate-block-frame"]')!;
    expect(tokenFor(frame, "bg")).toBe("--alarm-tint-hi");
    expect(tokenFor(frame, "text")).toBe("--alarm-text");
    expect(tokenFor(frame, "border")).toBe("--alarm");
    expect(frame.classList.contains("border")).toBe(true);
    expect(frame.classList.contains("border-t-2")).toBe(true);
    // the ■ glyph is --alarm as a FILL: an svg shape, no text inside it
    const glyph = frame.querySelector('svg[data-glyph="gate-failure"]')!;
    expect(tokenFor(glyph, "text")).toBe("--alarm");
    expect(glyph.textContent).toBe("");
    expect(frame.textContent).toContain("GATE · BLOCKED");
    expect(frame.querySelector('[data-slot="gate-block-detail"]')!.textContent).toBe("1 blocking finding");
    expect(frame.querySelector('[data-slot="gate-block-delivery"]')!.textContent).toBe("delivered by check_run");
  });

  it("says why in numbers or in the API's words, never in adjectives", () => {
    const detail = (el: React.ReactElement) => render(el).container.querySelector('[data-slot="gate-block-detail"]')?.textContent ?? null;
    expect(detail(<GateBlock conclusion="failure" blocking={2} announce={false} />)).toBe("2 blocking findings");
    expect(detail(<GateBlock conclusion="success" blocking={0} announce={false} />)).toBe("0 blocking findings");
    expect(detail(<GateBlock conclusion="neutral" reason="Nothing could be executed in this run." announce={false} />)).toBe("Nothing could be executed in this run.");
    expect(detail(<GateBlock conclusion={null} blocking={3} announce={false} />)).toBeNull();
    expect(detail(<GateBlock conclusion="failure" announce={false} />)).toBeNull();
    const all = render(<GateBlock conclusion="failure" blocking={1} delivery="check_run" announce={false} />).container.textContent!;
    expect(all).not.toMatch(/\bproven (bug|finding)/i);
  });

  it("keeps one box in every state: the 2px rule comes out of the padding", () => {
    const top = (reading: GateReading, withLine: boolean) => {
      const { container } = render(
        <GateBlock
          conclusion={reading}
          blocking={withLine ? 1 : undefined}
          reason={withLine ? "Nothing could be executed in this run." : undefined}
          delivery={withLine ? "check_run" : null}
          announce={false}
        />,
      );
      const frame = container.querySelector('[data-slot="gate-block-frame"]')!;
      const cls = [...frame.classList];
      const border = cls.includes("border-t-2") ? 2 : 1;
      const pad = cls.includes("pt-[11px]") ? 11 : cls.includes("pt-[7px]") ? 7 : cls.includes("py-3") ? 12 : cls.includes("py-2") ? 8 : NaN;
      return border + pad;
    };
    expect(top("failure", true)).toBe(13);
    expect(top("success", true)).toBe(13);
    expect(top("neutral", true)).toBe(13);
    expect(top("failure", false)).toBe(9);
    expect(top(null, false)).toBe(9);
  });

  it("paints CLEAR achromatic: --text-body on --signal-tint-lo, a --signal-lo underline, no check", () => {
    const { container } = render(<GateBlock conclusion="success" blocking={0} delivery="check_run" announce={false} />);
    const frame = container.querySelector('[data-slot="gate-block-frame"]')!;
    expect(tokenFor(frame, "bg")).toBe("--signal-tint-lo");
    expect(tokenFor(frame, "text")).toBe("--text-body");
    expect(tokenFor(frame, "border")).toBe("transparent");
    expect(tokenFor(frame, "border-b")).toBe("--signal-lo");
    expect(frame.classList.contains("border-t-2")).toBe(false);
    expect(frame.querySelector("svg")!.getAttribute("data-glyph")).toBe("gate-success");
    expect(frame.textContent).not.toMatch(/[✓✔☑]/);
    expect(frame.querySelector('[data-slot="gate-block-detail"]')!.textContent).toBe("0 blocking findings");
  });

  it("paints NEUTRAL and RUNNING as --text-dim on --ink-2 with a 1px --rule-1 border", () => {
    for (const reading of ["neutral", null] as const) {
      const { container } = render(<GateBlock conclusion={reading} reason="Nothing could be executed in this run." announce={false} />);
      const frame = container.querySelector('[data-slot="gate-block-frame"]')!;
      expect(tokenFor(frame, "bg")).toBe("--ink-2");
      expect(tokenFor(frame, "text")).toBe("--text-dim");
      expect(tokenFor(frame, "border")).toBe("--rule-1");
    }
  });

  it("uses no green and no chromatic state except BLOCKED", () => {
    for (const r of READINGS) {
      const { container } = render(<GateBlock conclusion={r} announce={false} />);
      for (const el of container.querySelectorAll("*")) {
        for (const c of colorsOf(el)) {
          expect(c.token, c.cls).not.toMatch(/diff-add|syn-number|ansi-green/);
          if (r !== "failure") expect(sameLiteral(c.token, "--alarm") || /alarm/.test(c.token), c.cls).toBe(false);
        }
      }
    }
  });

  it("is silent at first paint and fires role=alert only when the gate turns BLOCKED", () => {
    const view = render(<GateBlock conclusion={null} />);
    const alert = () => view.container.querySelector('[role="alert"]')!;
    const status = () => view.container.querySelector('[role="status"]')!;
    expect(alert().textContent).toBe("");
    expect(status().textContent).toBe("");

    view.rerender(<GateBlock conclusion="failure" blocking={1} delivery="check_run" />);
    expect(alert().textContent).toBe("merge gate blocked · 1 blocking finding · check_run");
    expect(status().textContent).toBe("");

    view.rerender(<GateBlock conclusion="success" blocking={0} delivery="check_run" />);
    expect(alert().textContent).toBe("");
    expect(status().textContent).toBe("merge gate clear · 0 blocking findings · check_run");
  });

  it("does not announce a gate that was already BLOCKED when the page loaded", () => {
    const { container } = render(<GateBlock conclusion="failure" blocking={1} />);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("");
  });
});

describe("GateChip", () => {
  it("never uses --alarm as a text background, and BLOCKED follows the failure rule", () => {
    const { container } = render(<GateChip conclusion="failure" />);
    const el = container.querySelector('[data-slot="gate-chip"]')!;
    assertAlarmIsFillOnly(el);
    expect(tokenFor(el, "bg")).toBe("--alarm-tint-hi");
    expect(tokenFor(el, "text")).toBe("--alarm-text");
    expect(tokenFor(el, "border")).toBe("--alarm");
    expect(el.classList.contains("border-t-2")).toBe(false);
    expect(el.textContent).toBe("merge gate BLOCKED");
  });

  it("labels and shapes every reading distinctly: ■ BLOCKED · — NEUTRAL · ○ CLEAR · ◉ RUNNING", () => {
    const seen = READINGS.map((r) => {
      const { container } = render(<GateChip conclusion={r} />);
      const el = container.querySelector('[data-slot="gate-chip"]')!;
      return { label: el.querySelector("span:not(.sr-only)")!.textContent, glyph: el.querySelector("svg")!.getAttribute("data-glyph") };
    });
    expect(seen).toEqual([
      { label: "BLOCKED", glyph: "gate-failure" },
      { label: "NEUTRAL", glyph: "gate-neutral" },
      { label: "CLEAR", glyph: "gate-success" },
      { label: "RUNNING", glyph: "gate-running" },
    ]);
  });
});
