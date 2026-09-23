// OWNER: t1d. Captured text → lines: splitting, \r composition, prompts, highlight rules.
import { describe, expect, it } from "vitest";
import { buildTerminalLines, composeLine, splitIntoGroups, type TerminalHighlightRule, type TerminalLine } from "@/components/code/terminal/model";
import { PYTEST_TONES } from "@/components/code/terminal/presets";

const ESC = "\x1b[";

/** Characters of `line` carrying `tone`, joined — what the reader sees in that colour. */
function toned(line: TerminalLine, tone: string): string {
  return line.segments
    .filter((s) => s.tone === tone)
    .map((s) => s.text)
    .join("|");
}

describe("line splitting", () => {
  it("splits on LF and CRLF and numbers from startLine", () => {
    const lines = buildTerminalLines("one\r\ntwo\nthree", { startLine: 40 });
    expect(lines.map((l) => [l.number, l.text])).toEqual([
      [40, "one"],
      [41, "two"],
      [42, "three"],
    ]);
  });

  it("drops exactly one trailing newline, keeps inner empty lines", () => {
    expect(buildTerminalLines("a\n\nb\n").map((l) => l.text)).toEqual(["a", "", "b"]);
    expect(buildTerminalLines("a\n\n").map((l) => l.text)).toEqual(["a", ""]);
    expect(buildTerminalLines("").map((l) => l.text)).toEqual([""]);
    expect(buildTerminalLines("\n").map((l) => l.text)).toEqual([""]);
    // pytest --color=yes ends with a reset after the last newline
    expect(buildTerminalLines(`${ESC}32m1 passed${ESC}0m\n${ESC}0m`).map((l) => l.text)).toEqual(["1 passed"]);
  });

  it("keeps ANSI state across a newline", () => {
    const [first, second] = buildTerminalLines(`${ESC}31mred\nstill red${ESC}0m plain`);
    expect(first.segments).toEqual([{ text: "red", classes: ["prg-ansi-fg-red"] }]);
    expect(second.segments).toEqual([
      { text: "still red", classes: ["prg-ansi-fg-red"] },
      { text: " plain", classes: [] },
    ]);
  });

  it("never splits a long line: one line, byte-exact", () => {
    const long = `$ ${"x".repeat(2000)} --end`;
    const lines = buildTerminalLines(long);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe(long);
  });
});

describe("carriage return and backspace", () => {
  it("collapses a progress bar to its final frame", () => {
    expect(buildTerminalLines("progress 12%\rprogress 57%\rprogress 100%")[0].text).toBe("progress 100%");
  });

  it("overwrites column by column, as a terminal does", () => {
    expect(buildTerminalLines("100%\r10%")[0].text).toBe("10%%");
    expect(buildTerminalLines("abc\r")[0].text).toBe("abc");
    expect(buildTerminalLines("ab\bc")[0].text).toBe("ac");
  });

  it("keeps each surviving character's classes", () => {
    const composed = composeLine([
      { text: "xxxx", classes: ["prg-ansi-fg-red"] },
      { text: "\ryy", classes: ["prg-ansi-fg-cyan"] },
    ]);
    expect(composed).toEqual([
      { text: "yy", classes: ["prg-ansi-fg-cyan"] },
      { text: "xx", classes: ["prg-ansi-fg-red"] },
    ]);
  });
});

describe("prompt lines", () => {
  it("splits '$ ' into a prompt glyph and a command", () => {
    const [line] = buildTerminalLines("$ git checkout 7c41a09 && pytest -q");
    expect(line.kind).toBe("prompt");
    expect(line.segments.map((s) => [s.role, s.text])).toEqual([
      ["prompt", "$ "],
      ["command", "git checkout 7c41a09 && pytest -q"],
    ]);
  });

  it("honours a custom prompt and can be turned off", () => {
    expect(buildTerminalLines(">>> run()", { prompt: ">>> " })[0].kind).toBe("prompt");
    expect(buildTerminalLines("$ ls", { prompt: false })[0].kind).toBe("output");
    expect(buildTerminalLines("  $ indented")[0].kind).toBe("output");
  });
});

describe("highlight rules", () => {
  it("applies no tones by default", () => {
    const lines = buildTerminalLines("1 passed in 0.42s\nE   boom");
    expect(lines.every((l) => l.tone === undefined && l.segments.every((s) => !s.tone))).toBe(true);
  });

  it("colours only the match for scope 'match', the whole line for scope 'line'", () => {
    const rules: TerminalHighlightRule[] = [
      { pattern: /^E\s/, tone: "alarm", scope: "line" },
      { pattern: /\bpassed\b/, tone: "signal" },
    ];
    const [pass, err] = buildTerminalLines("1 passed in 0.42s\nE       AttributeError: x", { highlight: rules });
    expect(toned(pass, "signal")).toBe("passed");
    expect(pass.segments.map((s) => s.text).join("")).toBe("1 passed in 0.42s");
    expect(err.tone).toBe("alarm");
    expect(toned(err, "alarm")).toBe("E       AttributeError: x");
  });

  it("lets a match tone beat the line tone, and earlier rules win overlaps", () => {
    const rules: TerminalHighlightRule[] = [
      { pattern: "failed", tone: "alarm" },
      { pattern: /fail/, tone: "marker" },
      { pattern: /summary/, tone: "dim", scope: "line" },
    ];
    const [line] = buildTerminalLines("summary: 1 failed, fail", { highlight: rules });
    expect(toned(line, "alarm")).toBe("failed");
    expect(toned(line, "marker")).toBe("fail");
    expect(toned(line, "dim")).toBe("summary: 1 |, ");
  });

  it("treats string patterns literally", () => {
    const [line] = buildTerminalLines("a.b axb", { highlight: [{ pattern: "a.b", tone: "signal" }] });
    expect(toned(line, "signal")).toBe("a.b");
  });

  it("survives zero-length and flagged patterns", () => {
    const [line] = buildTerminalLines("PASSED", { highlight: [{ pattern: /^/, tone: "alarm" }, { pattern: /passed/gi, tone: "signal" }] });
    expect(toned(line, "signal")).toBe("PASSED");
    expect(toned(line, "alarm")).toBe("");
  });

  it("beats captured ANSI colour: pytest's green 'passed' carries the signal tone", () => {
    const [line] = buildTerminalLines(`${ESC}32m1 passed${ESC}0m in 0.42s`, { highlight: PYTEST_TONES });
    const passed = line.segments.find((s) => s.text === "passed");
    expect(passed).toMatchObject({ tone: "signal", classes: ["prg-ansi-fg-green"] });
    const one = line.segments.find((s) => s.text === "1 ");
    expect(one?.tone).toBe("body"); // the summary line neutralises the rest of pytest's colour
  });

  it("collects marks in rule order, on the line and on the matched text", () => {
    const [line] = buildTerminalLines("1 failed in 0.39s", { highlight: PYTEST_TONES });
    expect(line.marks).toEqual(["summary", "failed"]);
    expect(line.segments.find((s) => s.text === "failed")?.mark).toBe("failed");
  });
});

describe("PYTEST_TONES on the landing §01 strings", () => {
  const head = [
    "$ git checkout 9c2d4b1 && pytest -q tests/test_repro_7e3f1a.py",
    `F${" ".repeat(56)}[100%]`,
    `${"=".repeat(35)} FAILURES ${"=".repeat(35)}`,
    `${"_".repeat(21)} test_charge_uses_account_currency ${"_".repeat(22)}`,
    "    def test_charge_uses_account_currency():",
    '        acct = resolve_account("acct_7f31")',
    '>       assert charge(acct, 1200).currency == "usd"',
    "E       AttributeError: 'NoneType' object has no attribute 'currency'",
    "tests/test_repro_7e3f1a.py:41: AttributeError",
    "1 failed in 0.39s",
  ].join("\n");

  it("tones the E line and 'failed' alarm, and nothing else", () => {
    const lines = buildTerminalLines(head, { highlight: PYTEST_TONES });
    const alarm = lines.filter((l) => l.segments.some((s) => s.tone === "alarm")).map((l) => [l.number, toned(l, "alarm")]);
    expect(alarm).toEqual([
      [8, "E       AttributeError: 'NoneType' object has no attribute 'currency'"],
      [10, "failed"],
    ]);
    expect(lines[0].kind).toBe("prompt");
    expect(lines[7].marks).toEqual(["error"]);
    expect(lines[9].marks).toEqual(["summary", "failed"]);
  });

  it("tones 'passed' signal on the base pane and the disproven head pane", () => {
    for (const summary of ["1 passed in 0.42s", "1 passed in 0.61s"]) {
      const lines = buildTerminalLines(`$ git checkout 7c41a09 && pytest -q x.py\n.${" ".repeat(56)}[100%]\n${summary}`, { highlight: PYTEST_TONES });
      expect(toned(lines[2], "signal")).toBe("passed");
      expect(lines.some((l) => l.segments.some((s) => s.tone === "alarm"))).toBe(false);
    }
  });

  it("tones a FAILED short-summary line alarm", () => {
    const [line] = buildTerminalLines("FAILED tests/x.py::test_y - AttributeError: boom", { highlight: PYTEST_TONES });
    expect(line.tone).toBe("alarm");
  });
});

describe("splitIntoGroups", () => {
  it("splits into contiguous near-equal groups", () => {
    expect(splitIntoGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
      [8, 9, 10],
    ]);
    expect(splitIntoGroups([1, 2], 3)).toEqual([[1], [2]]);
    expect(splitIntoGroups([], 3)).toEqual([[]]);
    expect(splitIntoGroups([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});
