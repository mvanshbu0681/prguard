// OWNER: T1b (wave 1). Design §5.5, dashboard §0.2 / §2.0, motion §4.2.2 — and the
// brief's test: "table row heights are 32/26". jsdom does no layout, so the height
// is asserted where it is decided (the density attribute and the stylesheet that
// maps it to px); /lab/t1b prints the height the browser measures.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TABLE_ROW_HEIGHT, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeletonRows } from "@/components/ui/table";
import { declValue, parseCss, readWebFile } from "./css-tree";

const CSS = parseCss(readWebFile("src/styles/ui.css"));
const px = (v: string | undefined) => Number(/^(\d+)px$/.exec(v ?? "")?.[1]);

function Ids({ density }: { density?: "default" | "compact" }) {
  return (
    <Table density={density}>
      <TableHeader>
        <TableRow>
          <TableHead>FIELD</TableHead>
          <TableHead>VALUE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>tenant_id</TableCell>
          <TableCell>7f3c9a21…1a3c</TableCell>
        </TableRow>
        <TableRow data-state="selected">
          <TableCell kind="prose">proven finding id</TableCell>
          <TableCell>a91f3c2e…8b4d</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("table row heights are 32/26", () => {
  it("exports 32px default and 26px compact", () => {
    expect(TABLE_ROW_HEIGHT).toEqual({ default: 32, compact: 26 });
  });

  it("maps the density attribute to exactly those heights in ui.css", () => {
    expect(px(declValue(CSS, ".ui-table", "--ui-row-h"))).toBe(TABLE_ROW_HEIGHT.default);
    expect(px(declValue(CSS, '.ui-table[data-density="compact"]', "--ui-row-h"))).toBe(TABLE_ROW_HEIGHT.compact);
    expect(declValue(CSS, ".ui-table tr", "height")).toBe("var(--ui-row-h)");
    // Cells add no vertical padding that could push a row past its height.
    expect(declValue(CSS, ".ui-table :is(th, td)", "padding")).toBe("0 var(--ui-cell-px)");
  });

  it("puts the density on the <table> itself: default unless asked", () => {
    const { rerender } = render(<Ids />);
    expect(screen.getByRole("table")).toHaveAttribute("data-density", "default");
    rerender(<Ids density="compact" />);
    expect(screen.getByRole("table")).toHaveAttribute("data-density", "compact");
  });

  it("renders skeleton rows at the table's density — N rows × M static bars", () => {
    render(
      <Table density="compact">
        <TableBody>
          <TableSkeletonRows rows={8} columns={6} />
        </TableBody>
      </Table>,
    );
    const rows = document.querySelectorAll('tr[data-slot="table-skeleton-row"]');
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row).toHaveAttribute("aria-hidden", "true");
      expect(row.querySelectorAll("td")).toHaveLength(6);
      for (const bar of row.querySelectorAll('[data-slot="skeleton"]')) expect(bar.className).not.toMatch(/animate|pulse|shimmer/);
    }
    expect(document.querySelector("table")).toHaveAttribute("data-density", "compact");
  });
});

describe("table styling contract", () => {
  it("separates rows with a bottom hairline and never stripes them", () => {
    expect(declValue(CSS, ".ui-table :is(th, td)", "border-bottom")).toBe("var(--border-hairline) solid var(--rule-hair)");
    expect(readWebFile("src/styles/ui.css")).not.toMatch(/tr:nth-(child|of-type)/);
  });

  it("sticks a solid ink-2 header, with no blur", () => {
    expect(declValue(CSS, ".ui-table thead th", "position")).toBe("sticky");
    expect(declValue(CSS, ".ui-table thead th", "background-color")).toBe("var(--ink-2)");
    expect(declValue(CSS, ".ui-table thead th", "backdrop-filter")).toBeUndefined();
  });

  it("steps a hovered row exactly one rung, ink-2 → ink-3, in 120ms", () => {
    expect(declValue(CSS, ".ui-table-wrap", "background-color")).toBe("var(--ink-2)");
    expect(declValue(CSS, ".ui-table-wrap", "--ui-hover-row")).toBe("var(--ink-3)");
    expect(declValue(CSS, ".ui-table tbody tr", "transition-duration")).toBe("var(--dur-1)");
    expect(declValue(CSS, ".ui-table tbody tr", "transition-timing-function")).toBe("var(--ease-snap)");
    expect(
      declValue(CSS, '.ui-table tbody tr:not([data-slot="table-skeleton-row"], [data-state="selected"], [aria-selected="true"]):hover', "background-color"),
    ).toBe("var(--ui-hover-row)");
  });

  it("marks a selected row ink-4 with a 2px --signal-lo left rail", () => {
    expect(declValue(CSS, '.ui-table tbody tr:is([data-state="selected"], [aria-selected="true"])', "background-color")).toBe("var(--ink-4)");
    expect(declValue(CSS, '.ui-table tbody tr:is([data-state="selected"], [aria-selected="true"]) > :first-child', "box-shadow")).toBe(
      "inset 2px 0 0 var(--signal-lo)",
    );
  });

  it("insets a focused row's ring and keeps it clear of the sticky header (SC 2.4.11)", () => {
    expect(declValue(CSS, '.ui-table tbody tr:is(:focus-visible, [data-force~="focus"])', "outline-offset")).toBe("-2px");
    expect(declValue(CSS, ".ui-table tbody tr", "scroll-margin-top")).toBe("calc(var(--ui-row-h) + var(--ui-sticky-top, 0px))");
  });

  it("sets data cells in mono and prose cells in Inter, headers scoped to columns", () => {
    render(<Ids />);
    const table = screen.getByRole("table");
    for (const th of within(table).getAllByRole("columnheader")) expect(th).toHaveAttribute("scope", "col");
    expect(within(table).getByText("proven finding id")).toHaveAttribute("data-kind", "prose");
    expect(within(table).getByText("tenant_id")).toHaveAttribute("data-kind", "data");
  });
});
