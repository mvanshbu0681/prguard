// OWNER: t1d. <CodeBlock> (async server component) and <CodeBlockClient> (client fallback).
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeBlock, CodeBlockClient } from "@/components/code";

const REPRO = [
  "def test_charge_uses_account_currency():",
  '    acct = resolve_account("acct_7f31")',
  '    assert charge(acct, 1200).currency == "usd"',
].join("\n");

async function renderServer(props: Parameters<typeof CodeBlock>[0]) {
  return render(await CodeBlock(props));
}

describe("<CodeBlock> (server)", () => {
  it("renders highlighted tokens as role classes, never inline colour", async () => {
    const { container } = await renderServer({ code: REPRO, filePath: "tests/test_repro_7e3f1a.py" });
    const root = container.querySelector(".prg-code");
    expect(root).toHaveAttribute("data-state", "highlighted");
    expect(root).toHaveAttribute("data-lang", "python");
    expect(container.querySelector(".prg-syn-keyword")?.textContent).toMatch(/^def/);
    expect(container.querySelector(".prg-syn-string")?.textContent).toContain('"acct_7f31"');
    expect(container.querySelector(".prg-syn-number")?.textContent).toBe("1200");
    expect(container.querySelector(".prg-syn-entity")?.textContent).toContain("test_charge_uses_account_currency");
    expect(container.querySelectorAll("[style]")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/var\(--|#[0-9a-f]{6}/i);
  });

  it("copies exactly the source: numbers are CSS content on aria-hidden gutters", async () => {
    const { container } = await renderServer({ code: `${REPRO}\n`, lang: "python", startLine: 39 });
    expect(container.querySelector("pre")?.textContent).toBe(REPRO);
    const gutters = [...container.querySelectorAll(".prg-code__gutter")];
    expect(gutters.map((g) => g.getAttribute("data-ln"))).toEqual(["39", "40", "41"]);
    for (const g of gutters) {
      expect(g).toHaveAttribute("aria-hidden", "true");
      expect(g.textContent).toBe("");
    }
  });

  it("highlights finding lines with the caller's tone and describes them to assistive tech", async () => {
    await renderServer({
      code: REPRO,
      lang: "python",
      startLine: 39,
      label: "repro test",
      highlight: [{ start: 41, tone: "alarm", label: "failing assertion" }],
    });
    const region = screen.getByRole("region", { name: "repro test" });
    const lines = region.querySelectorAll(".prg-code__line");
    expect([...lines].map((l) => l.getAttribute("data-hl"))).toEqual([null, null, "alarm"]);
    expect(region).toHaveAccessibleDescription("Highlighted line 41: failing assertion.");
  });

  it("supports ranges, and the first matching highlight wins", async () => {
    const { container } = await renderServer({
      code: "a\nb\nc\nd",
      lang: "text",
      highlight: [
        { start: 3, tone: "alarm" },
        { start: 2, end: 4, tone: "high" },
      ],
    });
    expect([...container.querySelectorAll(".prg-code__line")].map((l) => l.getAttribute("data-hl"))).toEqual([null, "high", "alarm", "high"]);
  });

  it("titles the header with the path and labels the language", async () => {
    const { container } = await renderServer({ code: "x = 1", filePath: "checkout/charge.py" });
    expect(container.querySelector(".prg-code__title")?.textContent).toBe("checkout/charge.py");
    expect(container.querySelector(".prg-code__lang")?.textContent).toBe("python");
    expect(screen.getByRole("region", { name: "checkout/charge.py" })).toHaveAttribute("tabindex", "0");
  });

  it("states an unsupported language instead of hiding it, with gutter intact", async () => {
    const { container } = await renderServer({ code: "defmodule A do\nend", filePath: "lib/charge.ex" });
    const root = container.querySelector(".prg-code");
    expect(root).toHaveAttribute("data-state", "plain");
    expect(root).not.toHaveAttribute("data-lang");
    expect(container.querySelector(".prg-code__note")?.textContent).toBe("syntax highlighting unavailable for .ex");
    expect(container.querySelectorAll(".prg-code__gutter[data-ln]")).toHaveLength(2);
    expect(container.querySelector('[class*="prg-syn-"]')).toBeNull();
  });

  it("prints no note for text asked for as plain, and no header when there is nothing to put in it", async () => {
    const { container } = await renderServer({ code: "plain words", lang: "text" });
    expect(container.querySelector(".prg-code__note")).toBeNull();
    expect(container.querySelector(".prg-code__header")).toBeNull();
    const withTitle = await renderServer({ code: "x", lang: "text", title: "RailTone" });
    expect(withTitle.container.querySelector(".prg-code__header")).not.toBeNull();
  });

  it("keeps a long line whole, on one line element", async () => {
    const long = `receipt = session.capture(${"amount_cents, ".repeat(40)}currency=session.currency)`;
    const { container } = await renderServer({ code: long, lang: "python" });
    const lines = container.querySelectorAll(".prg-code__line");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe(long);
  });
});

describe("<CodeBlockClient>", () => {
  it("renders plain text first in the identical DOM, then highlights after the lazy import", async () => {
    const { container } = render(<CodeBlockClient code={'{ "seq": 1428 }'} lang="json" title="canonical_json" />);
    const root = container.querySelector(".prg-code");
    expect(root).toHaveAttribute("data-state", "plain");
    expect(container.querySelector("pre")?.textContent).toBe('{ "seq": 1428 }');
    await waitFor(() => expect(root).toHaveAttribute("data-state", "highlighted"));
    expect(container.querySelector(".prg-syn-number")?.textContent).toBe("1428");
    expect(container.querySelector("pre")?.textContent).toBe('{ "seq": 1428 }');
    expect(container.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("never loads a highlighter for an unsupported language", async () => {
    const { container } = render(<CodeBlockClient code="defmodule A do end" filePath="a.ex" />);
    expect(container.querySelector(".prg-code__note")?.textContent).toBe("syntax highlighting unavailable for .ex");
    expect(container.querySelector(".prg-code")).toHaveAttribute("data-state", "plain");
  });
});
