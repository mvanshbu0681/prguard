// OWNER: t1d. <PRGuardDiff>: glyph column, quarantined colours, finding lines, annotations.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRGuardDiff } from "@/components/code";

const DIFF = [
  "--- a/checkout/charge.py",
  "+++ b/checkout/charge.py",
  "@@ -38,4 +38,4 @@ def charge(account, amount_cents):",
  '     audit.log("charge", receipt.id)',
  "-    return receipt",
  "+    ledger.record(receipt)",
  " ",
  " ",
].join("\n");

const rowsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".prg-diff__row")];

describe("<PRGuardDiff>", () => {
  it("is a labelled, focusable region; unified by default", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} />);
    expect(screen.getByRole("region", { name: "Diff of checkout/charge.py" })).toHaveAttribute("tabindex", "0");
    expect(container.querySelector(".prg-diff")).toHaveAttribute("data-view", "unified");
  });

  it("renders every row with its kind and both line numbers, numbers as CSS content", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} />);
    const rows = rowsOf(container);
    expect(rows.map((r) => [r.dataset.kind, r.dataset.old ?? null, r.dataset.new ?? null])).toEqual([
      ["hunk", null, null],
      ["context", "38", "38"],
      ["del", "39", null],
      ["add", null, "39"],
      ["context", "40", "40"],
      ["context", "41", "41"],
    ]);
    const nums = container.querySelectorAll(".prg-diff__num");
    nums.forEach((n) => {
      expect(n).toHaveAttribute("aria-hidden", "true");
      expect(n.textContent).toBe("");
    });
  });

  it("carries the mandatory +/− glyph cell on every add and del row, readable to assistive tech", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} />);
    for (const row of rowsOf(container)) {
      const marker = row.querySelector(".prg-diff__marker");
      expect(marker, row.dataset.kind).not.toBeNull();
      const gutter = row.querySelector(".prg-diff__gutter");
      if (row.dataset.kind === "add" || row.dataset.kind === "del") expect(gutter).not.toHaveAttribute("aria-hidden");
      else expect(gutter).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("copies the code, not the gutter", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} />);
    expect(container.querySelector("pre")?.textContent).toBe(
      ["@@ -38,4 +38,4 @@ def charge(account, amount_cents):", '    audit.log("charge", receipt.id)', "    return receipt", "    ledger.record(receipt)", "", ""].join("\n"),
    );
  });

  it("highlights the finding's line on the side it names", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} highlight={[{ side: "new", start: 39, tone: "alarm", label: "finding a91f3c2e" }]} />);
    const hl = rowsOf(container).filter((r) => r.dataset.hl);
    expect(hl.map((r) => [r.dataset.kind, r.dataset.new, r.dataset.hl])).toEqual([["add", "39", "alarm"]]);
    expect(screen.getByRole("region")).toHaveAccessibleDescription("Highlighted new line 39: finding a91f3c2e.");
    const old = render(<PRGuardDiff diff={DIFF} highlight={[{ side: "old", start: 39, tone: "critical" }]} />);
    expect(rowsOf(old.container).filter((r) => r.dataset.hl).map((r) => r.dataset.kind)).toEqual(["del"]);
  });

  it("hangs an annotation directly beneath its line, outside the pre", () => {
    const { container } = render(
      <PRGuardDiff diff={DIFF} annotations={[{ side: "new", line: 39, tone: "alarm", label: "finding a91f3c2e", content: <p>card</p> }]} />,
    );
    const note = screen.getByRole("note", { name: "finding a91f3c2e" });
    expect(note).toHaveTextContent("card");
    expect(note.closest("pre")).toBeNull();
    expect(note).toHaveAttribute("data-hl", "alarm");
    const pres = container.querySelectorAll("pre");
    expect(pres).toHaveLength(2);
    const before = rowsOf(pres[0] as HTMLElement);
    expect(before[before.length - 1].dataset.new).toBe("39");
    expect(pres[0].nextElementSibling).toBe(note);
  });

  it("uses no inline colour anywhere", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} highlight={[{ start: 39, tone: "alarm" }]} />);
    expect(container.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("prints path and change counts in the header, with words for assistive tech", () => {
    const { container } = render(<PRGuardDiff diff={DIFF} filePath="checkout/charge.py" />);
    const header = container.querySelector(".prg-diff__header") as HTMLElement;
    expect(within(header).getByText("checkout/charge.py")).toBeInTheDocument();
    expect(header.textContent).toContain("+1 −1");
    expect(within(header).getByText("1 added, 1 removed")).toHaveClass("sr-only");
  });

  it("names no file when a bare patch carries none", () => {
    const { container } = render(<PRGuardDiff diff={"@@ -1 +1 @@\n-a\n+b"} />);
    expect(screen.getByRole("region", { name: "Diff" })).toBeInTheDocument();
    expect(container.querySelector(".prg-diff__path")?.textContent).toBe("");
  });

  it("renders split view as two aligned columns with padding rows", () => {
    const split = [
      "@@ -1,3 +1,4 @@",
      " a",
      "-b",
      "+B",
      "+B2",
      " c",
    ].join("\n");
    const { container } = render(<PRGuardDiff diff={split} view="split" highlight={[{ side: "new", start: 3, tone: "alarm" }]} />);
    const [left, right] = [...container.querySelectorAll("pre")];
    expect(left).toHaveAttribute("data-side", "old");
    expect(right).toHaveAttribute("data-side", "new");
    const l = rowsOf(left as HTMLElement).map((r) => r.dataset.kind);
    const r = rowsOf(right as HTMLElement).map((row) => row.dataset.kind);
    expect(l).toEqual(["hunk", "context", "del", "empty", "context"]);
    expect(r).toEqual(["hunk", "context", "add", "add", "context"]);
    expect(rowsOf(right as HTMLElement).find((row) => row.dataset.hl)?.dataset.new).toBe("3");
    // the hunk header prints once, on the old side
    expect(rowsOf(right as HTMLElement)[0].textContent).toBe("");
  });

  it("never wraps: a long line stays one row", () => {
    const long = `+    return session.refund(${"receipt.id, ".repeat(30)}currency=session.currency)`;
    const { container } = render(<PRGuardDiff diff={`@@ -1,0 +1,1 @@\n${long}`} />);
    const rows = rowsOf(container).filter((r) => r.dataset.kind === "add");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toBe(long.slice(1));
  });
});
