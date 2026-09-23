// OWNER: t1d. Windowing past 400 rows (design §5.7, §5.8, dashboard §3b): the pure helpers,
// then the windowed DOM and its copy fidelity for each surface.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PYTEST_TONES, TerminalBlock } from "@/components/code";
import {
  WINDOW_THRESHOLD,
  allText,
  columnsOf,
  digitsOf,
  layoutRuns,
  maxColumns,
  shouldWindow,
  sliceText,
  withPinned,
} from "@/components/code/shared/windowing";

// ------------------------------------------------------------------ helpers

/** Dispatch a copy event the way a browser does and return what the page put on the clipboard. */
function copy(): { text: string | null; prevented: boolean } {
  const setData = vi.fn();
  const event = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { setData } });
  document.dispatchEvent(event);
  const call = setData.mock.calls.find(([type]) => type === "text/plain");
  return { text: call ? (call[1] as string) : null, prevented: event.defaultPrevented };
}

/** Select from `offset` characters into row `a` to `offset` characters into row `b`. */
function selectRows(container: HTMLElement, a: [number, number], b: [number, number]) {
  const point = ([index, offset]: [number, number]): [Node, number] => {
    const row = container.querySelector(`[data-index="${index}"]`);
    if (!row) throw new Error(`row ${index} is not rendered`);
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let left = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (left <= length) return [node, left];
      left -= length;
    }
    throw new Error(`offset ${offset} is past row ${index}`);
  };
  const [startNode, startOffset] = point(a);
  const [endNode, endOffset] = point(b);
  document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

describe("windowing — pure helpers", () => {
  it("windows strictly past the threshold", () => {
    expect(WINDOW_THRESHOLD).toBe(400);
    expect(shouldWindow(400)).toBe(false);
    expect(shouldWindow(401)).toBe(true);
  });

  it("counts monospace columns: tabs to the next stop, wide characters and emoji as two", () => {
    expect(columnsOf("abc", 8)).toBe(3);
    expect(columnsOf("\tx", 8)).toBe(9);
    expect(columnsOf("ab\tx", 4)).toBe(5);
    expect(columnsOf("日本", 8)).toBe(4);
    expect(columnsOf("ok 🔥", 8)).toBe(5);
    expect(maxColumns(["a", "\t\tb", "ccc"], 8)).toBe(17);
    expect(maxColumns([], 8)).toBe(0);
  });

  it("counts gutter digits", () => {
    expect(digitsOf(9)).toBe(1);
    expect(digitsOf(999)).toBe(3);
    expect(digitsOf(1000)).toBe(4);
    expect(digitsOf(12345)).toBe(5);
  });

  it("lays rendered items into runs with the spacer heights around them, padding excluded", () => {
    const row = (index: number) => ({ index, start: 8 + index * 22, end: 8 + (index + 1) * 22 });
    const total = 8 + 1000 * 22 + 8;
    expect(layoutRuns([row(0), row(1), row(2)], total, 8)).toEqual({ runs: [{ from: 0, to: 2, before: 0 }], after: 997 * 22 });
    expect(layoutRuns([row(10), row(11)], total, 8)).toEqual({ runs: [{ from: 10, to: 11, before: 220 }], after: 988 * 22 });
    // a pinned row far above the view: two runs and a gap spacer between them
    expect(layoutRuns([row(3), row(500), row(501)], total, 8)).toEqual({
      runs: [
        { from: 3, to: 3, before: 66 },
        { from: 500, to: 501, before: 496 * 22 },
      ],
      after: 498 * 22,
    });
    expect(layoutRuns([], total, 8)).toEqual({ runs: [], after: 1000 * 22 });
  });

  it("adds pinned indices to the window, sorted, unique and in range", () => {
    expect(withPinned([10, 11, 12], [], 100)).toEqual([10, 11, 12]);
    expect(withPinned([10, 11, 12], [3, 11, 250], 100)).toEqual([3, 10, 11, 12]);
  });

  it("slices the captured text between two points, skipping rows without text", () => {
    const rows = ["alpha", "beta", null, "gamma", "delta"];
    const textOf = (i: number) => rows[i] ?? null;
    expect(sliceText(textOf, { index: 0, offset: 2 }, { index: 0, offset: 4 })).toBe("ph");
    expect(sliceText(textOf, { index: 0, offset: 3 }, { index: 3, offset: 2 })).toBe("ha\nbeta\nga");
    expect(sliceText(textOf, { index: 3, offset: 2 }, { index: 0, offset: 3 })).toBe("ha\nbeta\nga");
    expect(allText(textOf, rows.length)).toBe("alpha\nbeta\ngamma\ndelta");
    expect(allText(textOf, 0)).toBe("");
  });
});

// ------------------------------------------------------------------ terminal

const LONG = Array.from({ length: 1200 }, (_, i) => (i === 7 ? "E       AttributeError: 'NoneType' object has no attribute 'currency'" : `line ${i + 1} of the capture`)).join("\n");

describe("<TerminalBlock> windowed", () => {
  it("renders at or below 400 lines in full, with no windowing attributes", () => {
    const text = Array.from({ length: 400 }, (_, i) => `l${i}`).join("\n");
    const { container } = render(<TerminalBlock text={text} label="t" />);
    expect(container.querySelectorAll(".prg-terminal__line")).toHaveLength(400);
    expect(container.querySelector("[data-windowed]")).toBeNull();
    expect(container.querySelector("[data-index]")).toBeNull();
    expect(container.querySelector(".prg-terminal__spacer")).toBeNull();
  });

  it("renders only the lines near the view, between spacers that hold the rest", () => {
    const { container } = render(<TerminalBlock text={LONG} label="pytest -v at head" lineNumbers height={440} highlight={PYTEST_TONES} />);
    const lines = [...container.querySelectorAll<HTMLElement>(".prg-terminal__line")];
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.length).toBeLessThan(100);
    // the first window starts at the top, numbered and indexed
    expect(lines[0].dataset.index).toBe("0");
    expect(lines[0].querySelector("[data-ln]")?.getAttribute("data-ln")).toBe("1");
    const spacers = [...container.querySelectorAll<HTMLElement>(".prg-terminal__spacer")];
    expect(spacers.length).toBeGreaterThanOrEqual(2);
    spacers.forEach((s) => expect(s).toHaveAttribute("aria-hidden", "true"));
    // rendered rows + the bottom spacer account for every line (22px each)
    const bottom = spacers[spacers.length - 1];
    expect(Number.parseFloat(bottom.style.blockSize)).toBe((1200 - lines.length) * 22);
    // tones still apply to windowed lines
    expect(container.querySelector('[data-index="7"]')).toHaveAttribute("data-tone", "alarm");
  });

  it("keeps the region contract, and tells assistive technology how to copy every line", () => {
    const { container } = render(<TerminalBlock text={LONG} label="pytest -v at head" />);
    const region = screen.getByRole("region", { name: "pytest -v at head" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAttribute("data-windowed");
    expect(region).toHaveAccessibleDescription(/^1200 lines, rendered as they scroll into view\. Select all inside this region to copy every line\.$/);
    const pre = container.querySelector("pre") as HTMLElement;
    expect(pre).toHaveAttribute("data-windowed");
    // the widest line keeps the sheet wide while it is not rendered
    expect(pre.style.getPropertyValue("--prg-cols")).toBe(String("E       AttributeError: 'NoneType' object has no attribute 'currency'".length));
  });

  it("keeps the stepped row groups and the newline separators of a full pane", () => {
    const { container } = render(<TerminalBlock text={LONG} label="t" />);
    const groups = container.querySelectorAll(".prg-terminal__group");
    expect([...groups].map((g) => g.getAttribute("data-row-group"))).toEqual(["0"]);
    const code = container.querySelector("code") as HTMLElement;
    const rendered = container.querySelectorAll(".prg-terminal__line").length;
    const expected = LONG.split("\n").slice(0, rendered).join("\n");
    expect(code.textContent).toBe(expected);
  });

  it("answers a copy inside the region from the captured text, gutter excluded", () => {
    const { container } = render(<TerminalBlock text={LONG} label="t" lineNumbers />);
    selectRows(container, [2, 5], [8, 4]);
    const { text, prevented } = copy();
    expect(prevented).toBe(true);
    const rows = LONG.split("\n");
    expect(text).toBe([rows[2].slice(5), ...rows.slice(3, 8), rows[8].slice(0, 4)].join("\n"));
  });

  it("copies every line after select-all inside the focused region, rendered or not", () => {
    const { container } = render(<TerminalBlock text={LONG} label="t" />);
    const region = screen.getByRole("region");
    region.focus();
    fireEvent.keyDown(region, { key: "a", ctrlKey: true });
    const selection = document.getSelection();
    expect(selection?.isCollapsed).toBe(false);
    expect(container.querySelector("code")?.contains(selection?.anchorNode ?? null)).toBe(true);
    expect(copy().text).toBe(LONG);
    expect(copy().text).toBe(LONG); // copying again keeps the mode
    // pressing on the text starts a new selection and leaves "every line"
    fireEvent.pointerDown(container.querySelector('[data-index="0"]') as HTMLElement);
    act(() => selectRows(container, [0, 0], [0, 4]));
    expect(copy().text).toBe("line");
  });

  it("leaves 'every line' when a key moves the selection", () => {
    const { container } = render(<TerminalBlock text={LONG} label="t" />);
    const region = screen.getByRole("region");
    fireEvent.keyDown(region, { key: "a", metaKey: true });
    expect(copy().text).toBe(LONG);
    fireEvent.keyDown(region, { key: "ArrowLeft", shiftKey: true });
    act(() => selectRows(container, [1, 0], [1, 4]));
    expect(copy().text).toBe("line");
  });

  it("leaves a copy that starts outside the surface to the browser", () => {
    const { container } = render(
      <div>
        <p id="outside">before the pane</p>
        <TerminalBlock text={LONG} label="t" />
      </div>,
    );
    const outside = container.querySelector("#outside")?.firstChild as Node;
    const row = container.querySelector('[data-index="3"]') as HTMLElement;
    document.getSelection()?.setBaseAndExtent(outside, 0, row, 1);
    const { text, prevented } = copy();
    expect(text).toBeNull();
    expect(prevented).toBe(false);
  });

  it("widens the gutter past 999 instead of overflowing it", () => {
    const { container } = render(<TerminalBlock text={LONG} label="t" lineNumbers />);
    expect((container.querySelector(".prg-terminal") as HTMLElement).style.getPropertyValue("--prg-digits")).toBe("4");
    const short = render(<TerminalBlock text={"a\nb"} label="t" lineNumbers />);
    expect(short.container.querySelector(".prg-terminal")).not.toHaveAttribute("style");
  });
});
