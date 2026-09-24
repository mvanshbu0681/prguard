// OWNER: t1d. <TerminalBlock>: the DOM contract the Proof Bench builds on.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PYTEST_TONES, TerminalBlock } from "@/components/code";

const ESC = "\x1b[";
const BASE = ["$ git checkout 7c41a09 && pytest -q tests/test_repro_7e3f1a.py", `.${" ".repeat(56)}[100%]`, "1 passed in 0.42s"].join("\n");

function pre(container: HTMLElement) {
  const el = container.querySelector("pre");
  if (!el) throw new Error("no <pre>");
  return el;
}

describe("<TerminalBlock>", () => {
  it("is a labelled, focusable region around a pre", () => {
    const { container } = render(<TerminalBlock text={BASE} label="pytest at base 7c41a09" />);
    const region = screen.getByRole("region", { name: "pytest at base 7c41a09" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.querySelector("pre > code")).not.toBeNull();
    expect(container.querySelector(".prg-terminal")).toContainElement(region);
  });

  it("becomes a log with aria-busy when live", () => {
    render(<TerminalBlock text="collecting" label="live proof" live busy />);
    expect(screen.getByRole("log", { name: "live proof" })).toHaveAttribute("aria-busy", "true");
  });

  it("copies exactly the captured text: the gutter contributes nothing", () => {
    const { container } = render(<TerminalBlock text={`${BASE}\n`} label="t" lineNumbers />);
    expect(pre(container).textContent).toBe(BASE);
    const gutters = container.querySelectorAll(".prg-terminal__gutter");
    expect([...gutters].map((g) => g.getAttribute("data-ln"))).toEqual(["1", "2", "3"]);
    gutters.forEach((g) => {
      expect(g).toHaveAttribute("aria-hidden", "true");
      expect(g.textContent).toBe("");
    });
  });

  it("numbers from startLine, and omits numbers without lineNumbers", () => {
    const { container, rerender } = render(<TerminalBlock text={"a\nb"} label="t" lineNumbers startLine={41} />);
    expect([...container.querySelectorAll("[data-ln]")].map((g) => g.getAttribute("data-ln"))).toEqual(["41", "42"]);
    rerender(<TerminalBlock text={"a\nb"} label="t" />);
    expect(container.querySelectorAll("[data-ln]")).toHaveLength(0);
    expect(container.querySelector(".prg-terminal")).not.toHaveAttribute("data-gutter");
  });

  it("renders ANSI as classes, never inline colour", () => {
    const text = `${ESC}31;1mE       AttributeError${ESC}0m ${ESC}38;2;10;200;30mtrue${ESC}0m ${ESC}48;5;21mbg${ESC}0m`;
    const { container } = render(<TerminalBlock text={text} label="t" />);
    expect(container.querySelectorAll("[style]")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/color|rgb\(|#[0-9a-f]{3,6}\b/i);
    expect(container.querySelector(".prg-ansi-fg-red.prg-ansi-bold")?.textContent).toBe("E       AttributeError");
    expect(container.querySelector(".prg-ansi-fg-green")?.textContent).toBe("true");
    expect(container.querySelector(".prg-ansi-bg-blue")?.textContent).toBe("bg");
    expect(pre(container).textContent).toBe("E       AttributeError true bg");
  });

  it("applies the highlight rules' tones as data attributes", () => {
    const head = [
      "$ git checkout 9c2d4b1 && pytest -q tests/test_repro_7e3f1a.py",
      "E       AttributeError: 'NoneType' object has no attribute 'currency'",
      "1 failed in 0.39s",
    ].join("\n");
    const { container } = render(<TerminalBlock text={head} label="t" highlight={PYTEST_TONES} />);
    const lines = container.querySelectorAll(".prg-terminal__line");
    expect(lines[0]).toHaveAttribute("data-kind", "prompt");
    expect(lines[0].querySelector(".prg-terminal__prompt")?.textContent).toBe("$ ");
    expect(lines[0].querySelector(".prg-terminal__command")?.textContent).toBe("git checkout 9c2d4b1 && pytest -q tests/test_repro_7e3f1a.py");
    expect(lines[1]).toHaveAttribute("data-tone", "alarm");
    expect(lines[1]).toHaveAttribute("data-mark", "error");
    expect(lines[2]).toHaveAttribute("data-mark", "summary failed");
    expect(lines[2].querySelector('[data-tone="alarm"]')?.textContent).toBe("failed");
    expect(lines[2].querySelector('[data-mark="failed"]')?.textContent).toBe("failed");
  });

  it("tones 'passed' signal and never alarm on the base pane", () => {
    const { container } = render(<TerminalBlock text={BASE} label="t" highlight={PYTEST_TONES} />);
    expect(container.querySelector('[data-tone="signal"]')?.textContent).toBe("passed");
    expect(container.querySelector('[data-tone="alarm"]')).toBeNull();
  });

  it("keeps a long line on one line element, byte-exact", () => {
    const long = `$ docker run ${"--flag ".repeat(60)}python:3.12-slim pytest -q tests/test_repro_7e3f1a.py`;
    const { container } = render(<TerminalBlock text={long} label="t" lineNumbers />);
    const lines = container.querySelectorAll(".prg-terminal__line");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe(long);
    expect(container.querySelector("br, wbr")).toBeNull();
    expect(pre(container).textContent).not.toContain("­"); // no soft hyphen
  });

  it("carries the pane variants the bench composes", () => {
    const { container } = render(<TerminalBlock text="x" label="t" background="alarm-tint-lo" rail="alarm" />);
    const root = container.querySelector(".prg-terminal");
    expect(root).toHaveAttribute("data-bg", "alarm-tint-lo");
    expect(root).toHaveAttribute("data-rail", "alarm");
    expect(container.querySelector(".prg-terminal__rail")).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to the --ink-1 pane with no rail", () => {
    const { container } = render(<TerminalBlock text="x" label="t" />);
    const root = container.querySelector(".prg-terminal");
    expect(root).toHaveAttribute("data-bg", "default");
    expect(root).not.toHaveAttribute("data-rail");
    expect(container.querySelector(".prg-terminal__rail")).toBeNull();
  });

  it("groups rows into three stepped groups for the bench's reveal", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container } = render(<TerminalBlock text={text} label="t" />);
    const groups = container.querySelectorAll(".prg-terminal__group");
    expect([...groups].map((g) => [g.getAttribute("data-row-group"), g.querySelectorAll(".prg-terminal__line").length])).toEqual([
      ["0", 4],
      ["1", 3],
      ["2", 3],
    ]);
    expect(pre(container).textContent).toBe(text);
  });

  it("sizes the viewport from height / maxHeight", () => {
    render(<TerminalBlock text="x" label="sized" height={210} />);
    expect(screen.getByRole("region", { name: "sized" })).toHaveStyle({ height: "210px" });
  });
});
