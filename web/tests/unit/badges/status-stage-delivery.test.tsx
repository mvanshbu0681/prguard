// OWNER: t1c (wave 1). StatusBadge (§1.9: border STYLE is the encoding), StageDot (§1.11:
// five shapes, the running ring carries `heartbeat`) and DeliveryModeChip (§D labels).
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DELIVERY_MODE, DeliveryModeChip, FINDING_STATUS, STAGE_DOT_SHAPE, StageDot, StatusBadge } from "@/components/badges";
import type { DeliveryMode, FindingStatus, StageState } from "@/lib/contracts";
import { tokenFor } from "./tokens";

const STATUSES = Object.keys(FINDING_STATUS) as FindingStatus[];
const STATES = Object.keys(STAGE_DOT_SHAPE) as StageState[];
const MODES = Object.keys(DELIVERY_MODE) as DeliveryMode[];

function badge(status: FindingStatus) {
  const { container } = render(<StatusBadge status={status} />);
  const el = container.querySelector<HTMLElement>('[data-slot="status-badge"]')!;
  return { el, label: el.querySelector<HTMLElement>("span:not(.sr-only)")!, glyph: el.querySelector("svg") };
}

describe("StatusBadge — border style is the encoding", () => {
  it("covers the five API statuses", () => {
    expect([...STATUSES].sort()).toEqual(["disproven", "dropped", "proposed", "published", "suppressed"]);
  });

  it("proposed: 1px dotted --rule-2, --text-dim", () => {
    const { el } = badge("proposed");
    expect(el.classList.contains("border-dotted")).toBe(true);
    expect(tokenFor(el, "border")).toBe("--rule-2");
    expect(tokenFor(el, "text")).toBe("--text-dim");
  });

  it("published: a 2px --signal-lo left rail, --text-body", () => {
    const { el } = badge("published");
    expect(el.classList.contains("border-l-2")).toBe(true);
    expect(tokenFor(el, "border-l")).toBe("--signal-lo");
    expect(tokenFor(el, "border")).toBe("transparent");
    expect(tokenFor(el, "text")).toBe("--text-body");
  });

  it("suppressed: 1.5px dashed --ink-7 with the ledger glyph", () => {
    const { el, glyph } = badge("suppressed");
    expect(el.classList.contains("border-dashed")).toBe(true);
    expect(el.classList.contains("border-[1.5px]")).toBe(true);
    expect(tokenFor(el, "border")).toBe("--ink-7");
    expect(glyph?.getAttribute("data-glyph")).toBe("ledger");
  });

  it("dropped: strikethrough and no border", () => {
    const { el, label, glyph } = badge("dropped");
    expect(tokenFor(el, "border")).toBe("transparent");
    expect(label.classList.contains("line-through")).toBe(true);
    expect(glyph).toBeNull();
  });

  it("disproven: the disproven proof chip's outline, struck vial and struck label", () => {
    const { el, label, glyph } = badge("disproven");
    expect(tokenFor(el, "border")).toBe("--signal");
    expect(tokenFor(el, "text")).toBe("--signal-text");
    expect(glyph?.getAttribute("data-glyph")).toBe("vial-struck");
    expect(label.classList.contains("line-through")).toBe(true);
  });

  it("gives every status a distinct border style / label pair", () => {
    const keys = STATUSES.map((s) => {
      const { el, label } = badge(s);
      const style = ["border-dotted", "border-dashed", "border-l-2"].find((c) => el.classList.contains(c)) ?? tokenFor(el, "border");
      return `${style}|${label.textContent}`;
    });
    expect(new Set(keys).size).toBe(STATUSES.length);
    expect(STATUSES.map((s) => badge(s).label.textContent)).toEqual(["PROPOSED", "PUBLISHED", "SUPPRESSED", "DROPPED", "DISPROVEN"]);
  });
});

describe("StageDot — §1.11", () => {
  function dot(state: StageState, extra: Partial<Parameters<typeof StageDot>[0]> = {}) {
    const { container } = render(<StageDot state={state} {...extra} />);
    return container.querySelector<SVGSVGElement>('svg[data-slot="stage-dot"]')!;
  }

  it("draws five distinct shapes", () => {
    const shapes = STATES.map((s) => dot(s).dataset.shape);
    expect(shapes).toEqual(["ring", "ring-dot", "disc", "triangle", "square"]);
  });

  it("paints each node with its §1.11 token", () => {
    const paint = Object.fromEntries(STATES.map((s) => [s, tokenFor(dot(s), "text")]));
    expect(paint).toEqual({ pending: "--ink-6", running: "--signal-hi", done: "--signal-lo", degraded: "--marker", failed: "--alarm" });
  });

  it("draws pending hollow and done/degraded/failed filled", () => {
    expect(dot("pending").querySelector("circle")!.getAttribute("fill")).toBe("none");
    expect(dot("done").querySelector("circle")!.getAttribute("fill")).toBe("currentColor");
    expect(dot("degraded").querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    expect(dot("failed").querySelector("rect")!.getAttribute("fill")).toBe("currentColor");
  });

  it("puts the class `heartbeat` on the running ring, and nowhere else", () => {
    const running = dot("running");
    const ring = running.querySelector(".heartbeat");
    expect(ring?.tagName.toLowerCase()).toBe("circle");
    expect(ring?.getAttribute("fill")).toBe("none");
    for (const s of STATES.filter((x) => x !== "running")) expect(dot(s).querySelector(".heartbeat"), s).toBeNull();
  });

  it("writes the real heartbeat period on the element, never on :root", () => {
    const el = dot("running", { heartbeatMs: 1200 });
    expect(el.style.getPropertyValue("--heartbeat-period")).toBe("1200ms");
    expect(document.documentElement.style.getPropertyValue("--heartbeat-period")).toBe("");
    expect(dot("done", { heartbeatMs: 1200 }).style.getPropertyValue("--heartbeat-period")).toBe("");
  });

  it("is named for assistive tech unless a visible label already says it", () => {
    expect(dot("degraded").getAttribute("aria-label")).toBe("stage degraded");
    expect(dot("degraded").getAttribute("role")).toBe("img");
    const quiet = dot("done", { label: false });
    expect(quiet.getAttribute("aria-hidden")).toBe("true");
    expect(quiet.getAttribute("aria-label")).toBeNull();
  });
});

describe("DeliveryModeChip", () => {
  function chip(mode: DeliveryMode) {
    const { container } = render(<DeliveryModeChip mode={mode} />);
    const el = container.querySelector<HTMLElement>('[data-slot="delivery-mode-chip"]')!;
    return { el, label: el.querySelector("span:not(.sr-only)")!.textContent, glyph: el.querySelector("svg")!.getAttribute("data-glyph") };
  }

  it("labels the five modes as their values in mono caps (brand-gaps §D)", () => {
    expect(MODES.map((m) => chip(m).label)).toEqual(["INLINE EXACT", "INLINE NEAREST", "FILE LEVEL", "SUMMARY ONLY", "NOT DELIVERED"]);
  });

  it("shows the rung that fired by position on the ladder glyph", () => {
    expect(MODES.map((m) => chip(m).glyph)).toEqual(["rung-0", "rung-1", "rung-2", "rung-3", "rung-none"]);
  });

  it("marks the three ladder fallbacks with --marker and not_delivered with the quiet style", () => {
    for (const m of ["inline_nearest", "file_level", "summary_only"] as const) {
      const { el } = chip(m);
      expect(tokenFor(el, "border"), m).toBe("--marker");
      expect(tokenFor(el, "text"), m).toBe("--marker-text");
    }
    const exact = chip("inline_exact").el;
    expect(tokenFor(exact, "text")).toBe("--text-body");
    const none = chip("not_delivered").el;
    expect(tokenFor(none, "text")).toBe("--text-disabled");
    expect(tokenFor(none, "border")).toBe("--rule-2");
  });
});
