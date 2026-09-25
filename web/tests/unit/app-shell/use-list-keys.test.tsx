// OWNER: t9a (wave 2). useListKeys — the j/k/Enter grid controller exported
// for wave 3's tables (dashboard §1.5). Exercised against a synthetic list
// rendered with the hook's own props, since this track owns no table.
import "../ui/dom-polyfills";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useListKeys } from "@/components/app-shell/useListKeys";

function Grid({ count, onOpen }: { count: number; onOpen: (i: number) => void }) {
  const { activeIndex, gridProps, rowProps } = useListKeys({ count, onOpen });
  return (
    <div {...gridProps} tabIndex={-1} data-testid="grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} {...rowProps(i)} data-testid={`row-${i}`}>
          row {i} {i === activeIndex ? "(active)" : ""}
        </div>
      ))}
    </div>
  );
}

describe("useListKeys", () => {
  it("moves the roving index with j and k, clamped at the ends", async () => {
    const user = userEvent.setup();
    render(<Grid count={3} onOpen={() => {}} />);
    const grid = screen.getByTestId("grid");
    grid.focus();

    expect(screen.getByTestId("row-0")).toHaveAttribute("tabIndex", "0");
    await user.keyboard("j");
    expect(screen.getByTestId("row-1")).toHaveAttribute("tabIndex", "0");
    await user.keyboard("j");
    expect(screen.getByTestId("row-2")).toHaveAttribute("tabIndex", "0");
    await user.keyboard("j"); // clamped, does not run off the end
    expect(screen.getByTestId("row-2")).toHaveAttribute("tabIndex", "0");
    await user.keyboard("k");
    expect(screen.getByTestId("row-1")).toHaveAttribute("tabIndex", "0");
  });

  it("opens the focused row on Enter", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<Grid count={3} onOpen={onOpen} />);
    screen.getByTestId("grid").focus();
    await user.keyboard("j{Enter}");
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("never fires while the keystroke belongs to an input nested in the grid", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    function GridWithFilter() {
      const { gridProps, rowProps } = useListKeys({ count: 2, onOpen });
      return (
        <div {...gridProps} data-testid="grid">
          <input aria-label="filter" />
          <div {...rowProps(0)} data-testid="row-0" />
        </div>
      );
    }
    render(<GridWithFilter />);
    await user.click(screen.getByLabelText("filter"));
    await user.keyboard("j");
    expect(screen.getByTestId("row-0")).toHaveAttribute("tabIndex", "0"); // unmoved: j was typed into the input
    await user.keyboard("{Enter}");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
