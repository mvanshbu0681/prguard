// OWNER: t1c (wave 1). ProofChip against docs/design/02-design-system.md §1.7 / §5.4.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROOF_CHIP, ProofChip } from "@/components/badges";
import type { ProofStatus } from "@/lib/contracts";
import { tokenFor } from "./tokens";

const STATUSES = Object.keys(PROOF_CHIP) as ProofStatus[];

function chip(status: ProofStatus) {
  const { container } = render(<ProofChip status={status} />);
  const el = container.querySelector<HTMLElement>('[data-slot="proof-chip"]');
  if (!el) throw new Error("no chip");
  const glyph = el.querySelector("svg");
  const label = el.querySelector<HTMLElement>("span:not(.sr-only)");
  return { el, glyph, label, container };
}

describe("ProofChip", () => {
  it("covers all six API statuses", () => {
    expect(STATUSES.sort()).toEqual(["disproven", "inconclusive", "not_applicable", "not_attempted", "proven", "skipped_no_env"]);
  });

  it("renders a distinct glyph and a distinct label for every ProofStatus", () => {
    const glyphs = new Set<string>();
    const labels = new Set<string>();
    for (const s of STATUSES) {
      const { glyph, label } = chip(s);
      expect(glyph, s).not.toBeNull();
      glyphs.add(glyph!.getAttribute("data-glyph")!);
      labels.add(label!.textContent!);
    }
    expect(glyphs.size).toBe(STATUSES.length);
    expect(labels.size).toBe(STATUSES.length);
  });

  it("prints the §5.4 labels: 11px mono caps values", () => {
    const text = (s: ProofStatus) => chip(s).label!.textContent;
    expect(text("proven")).toBe("PROVEN");
    expect(text("disproven")).toBe("DISPROVEN");
    expect(text("inconclusive")).toBe("INCONCLUSIVE");
    expect(text("not_attempted")).toBe("NOT ATTEMPTED");
    expect(text("not_applicable")).toBe("NOT APPLICABLE");
    expect(text("skipped_no_env")).toBe("SKIPPED NO ENV");
    expect(chip("proven").el.className).toContain("type-badge");
  });

  it("draws the vial the table names: filled, struck, half, empty", () => {
    const g = (s: ProofStatus) => chip(s).glyph!.getAttribute("data-glyph");
    expect(g("proven")).toBe("vial-filled");
    expect(g("disproven")).toBe("vial-struck");
    expect(g("inconclusive")).toBe("vial-half");
    expect(g("not_attempted")).toBe("vial-empty");
  });

  it("paints each state with exactly the §1.7 tokens", () => {
    const paint = (s: ProofStatus) => {
      const { el } = chip(s);
      return { bg: tokenFor(el, "bg"), fg: tokenFor(el, "text"), border: tokenFor(el, "border"), dashed: el.classList.contains("border-dashed") };
    };
    expect(paint("proven")).toEqual({ bg: "--signal", fg: "--ink-0", border: "transparent", dashed: false });
    expect(paint("disproven")).toEqual({ bg: "transparent", fg: "--signal-text", border: "--signal", dashed: false });
    expect(paint("inconclusive")).toEqual({ bg: "--marker-tint", fg: "--marker-text", border: "--marker", dashed: true });
    expect(paint("not_attempted")).toEqual({ bg: "transparent", fg: "--text-disabled", border: "--rule-2", dashed: false });
    // the two extra API states wear the not_attempted style, with their own label and vial
    expect(paint("not_applicable")).toEqual(paint("not_attempted"));
    expect(paint("skipped_no_env")).toEqual(paint("not_attempted"));
  });

  it("proven and disproven share the hue but never the fill (fill vs outline + glyph)", () => {
    const proven = chip("proven");
    const disproven = chip("disproven");
    expect(tokenFor(proven.el, "bg")).toBe("--signal");
    expect(tokenFor(disproven.el, "bg")).toBe("transparent");
    expect(proven.glyph!.getAttribute("data-glyph")).not.toBe(disproven.glyph!.getAttribute("data-glyph"));
  });

  it("strikes the disproven label and prints the caption on request", () => {
    const { container } = render(<ProofChip status="disproven" caption />);
    expect(container.querySelector('[data-slot="proof-chip"] span.line-through')?.textContent).toBe("DISPROVEN");
    expect(container.querySelector('[data-slot="proof-chip-caption"]')?.textContent).toBe("refuted by execution");
    const custom = render(<ProofChip status="inconclusive" caption="a human must decide" />);
    expect(custom.container.querySelector('[data-slot="proof-chip-caption"]')?.textContent).toBe("a human must decide");
    expect(chip("proven").el.querySelector(".line-through")).toBeNull();
  });

  it("never encodes a state with opacity (R4)", () => {
    for (const s of STATUSES) {
      const { container } = chip(s);
      const classes = [...container.querySelectorAll("*")].flatMap((n) => [...n.classList]);
      expect(classes.filter((c) => /(^|:)opacity-/.test(c)), s).toEqual([]);
      expect(container.innerHTML, s).not.toMatch(/opacity/);
    }
  });

  it("uses a 20px chip with a 12px decorative glyph and a spoken prefix", () => {
    const { el, glyph } = chip("proven");
    expect(el.className).toMatch(/\bh-5\b/);
    expect(glyph!.getAttribute("width")).toBe("12");
    expect(glyph!.getAttribute("aria-hidden")).toBe("true");
    expect(el.textContent).toBe("proof status PROVEN");
  });
});
