// OWNER: t1d. ANSI sequences map to CLASSES on the quarantined palette, never inline colours.
import { describe, expect, it } from "vitest";
import { ANSI_FAMILIES, familyFromRgb, familyOf, paletteRgb, parseAnsi, stripForeignEscapes } from "@/components/code/terminal/ansi";

const ESC = "\x1b[";
const sgr = (code: string | number, text: string) => `${ESC}${code}m${text}${ESC}0m`;

describe("parseAnsi — SGR to classes", () => {
  it("maps the eight families, normal and bright, to one class each", () => {
    ANSI_FAMILIES.forEach((family, i) => {
      expect(parseAnsi(sgr(30 + i, family))).toEqual([{ text: family, classes: [`prg-ansi-fg-${family}`] }]);
      expect(parseAnsi(sgr(90 + i, family))).toEqual([{ text: family, classes: [`prg-ansi-fg-${family}`] }]);
    });
  });

  it("maps backgrounds to bg classes", () => {
    expect(parseAnsi(sgr(41, "x"))).toEqual([{ text: "x", classes: ["prg-ansi-bg-red"] }]);
    expect(parseAnsi(sgr(106, "x"))).toEqual([{ text: "x", classes: ["prg-ansi-bg-cyan"] }]);
  });

  it("maps decorations, drops blink, and lets anser apply reverse", () => {
    expect(parseAnsi(sgr(1, "b"))[0].classes).toEqual(["prg-ansi-bold"]);
    expect(parseAnsi(sgr(2, "d"))[0].classes).toEqual(["prg-ansi-dim"]);
    expect(parseAnsi(sgr(3, "i"))[0].classes).toEqual(["prg-ansi-italic"]);
    expect(parseAnsi(sgr(4, "u"))[0].classes).toEqual(["prg-ansi-underline"]);
    expect(parseAnsi(sgr(9, "s"))[0].classes).toEqual(["prg-ansi-strike"]);
    expect(parseAnsi(sgr(8, "h"))[0].classes).toEqual(["prg-ansi-hidden"]);
    expect(parseAnsi(sgr(5, "blink"))).toEqual([{ text: "blink", classes: [] }]);
    // reverse with default colours: anser swaps to fg black on bg white
    expect(parseAnsi(sgr(7, "rev"))[0].classes).toEqual(["prg-ansi-fg-black", "prg-ansi-bg-white"]);
  });

  it("combines fg, bg and decorations in a stable order", () => {
    expect(parseAnsi(`${ESC}1;31;42mE${ESC}0m`)).toEqual([{ text: "E", classes: ["prg-ansi-fg-red", "prg-ansi-bg-green", "prg-ansi-bold"] }]);
  });

  it("maps 256-colour and truecolour to the nearest family, never a raw colour", () => {
    expect(parseAnsi(sgr("38;5;196", "x"))[0].classes).toEqual(["prg-ansi-fg-red"]);
    expect(parseAnsi(sgr("38;5;46", "x"))[0].classes).toEqual(["prg-ansi-fg-green"]);
    expect(parseAnsi(sgr("38;5;214", "x"))[0].classes).toEqual(["prg-ansi-fg-yellow"]);
    expect(parseAnsi(sgr("38;5;51", "x"))[0].classes).toEqual(["prg-ansi-fg-cyan"]);
    expect(parseAnsi(sgr("38;5;21", "x"))[0].classes).toEqual(["prg-ansi-fg-blue"]);
    expect(parseAnsi(sgr("38;5;201", "x"))[0].classes).toEqual(["prg-ansi-fg-magenta"]);
    expect(parseAnsi(sgr("38;5;244", "x"))[0].classes).toEqual(["prg-ansi-dim"]); // mid grey
    expect(parseAnsi(sgr("38;5;253", "x"))[0].classes).toEqual(["prg-ansi-fg-white"]);
    expect(parseAnsi(sgr("38;5;9", "x"))[0].classes).toEqual(["prg-ansi-fg-red"]); // 0–15 are base colours
    expect(parseAnsi(sgr("38;2;255;85;85", "x"))[0].classes).toEqual(["prg-ansi-fg-red"]);
    expect(parseAnsi(sgr("38;2;80;200;255", "x"))[0].classes).toEqual(["prg-ansi-fg-cyan"]);
    expect(parseAnsi(sgr("48;2;30;30;30", "x"))[0].classes).toEqual(["prg-ansi-bg-black"]);
  });

  it("never lets anser's stale truecolor value leak into a later span", () => {
    const spans = parseAnsi(`${sgr("38;2;10;200;30", "t")}${sgr(2, "dim")}${sgr(90, "grey")}`);
    expect(spans).toEqual([
      { text: "t", classes: ["prg-ansi-fg-green"] },
      { text: "dim", classes: ["prg-ansi-dim"] },
      { text: "grey", classes: ["prg-ansi-fg-black"] },
    ]);
  });

  it("strips non-SGR CSI, OSC, charset and two-byte escapes, and stray controls", () => {
    expect(parseAnsi(`a${ESC}2Kb${ESC}1Ac${ESC}?25ld`)).toEqual([{ text: "abcd", classes: [] }]);
    expect(stripForeignEscapes("x\x1b]8;;https://example.com\x07link\x1b]8;;\x07y")).toBe("xlinky");
    expect(stripForeignEscapes("\x1b(Bplain\x1b7\x1b8\x1bc")).toBe("plain");
    expect(parseAnsi("be\x07ll\x00")).toEqual([{ text: "bell", classes: [] }]);
    // \r and \b survive for the line composer; \t and \n are text
    expect(parseAnsi("a\tb\r\bc\n")[0].text).toBe("a\tb\r\bc\n");
  });

  it("rewrites 8-bit CSI so anser can parse it", () => {
    expect(parseAnsi("\x9b31mred\x9b0m")).toEqual([{ text: "red", classes: ["prg-ansi-fg-red"] }]);
  });

  it("merges adjacent spans that share classes", () => {
    expect(parseAnsi(`${ESC}31mab${ESC}31mcd${ESC}0m`)).toEqual([{ text: "abcd", classes: ["prg-ansi-fg-red"] }]);
  });

  it("returns nothing for empty input", () => {
    expect(parseAnsi("")).toEqual([]);
  });
});

describe("colour helpers", () => {
  it("computes the xterm-256 cube and grey ramp", () => {
    expect(paletteRgb(16)).toEqual([0, 0, 0]);
    expect(paletteRgb(196)).toEqual([255, 0, 0]);
    expect(paletteRgb(231)).toEqual([255, 255, 255]);
    expect(paletteRgb(232)).toEqual([8, 8, 8]);
    expect(paletteRgb(255)).toEqual([238, 238, 238]);
    expect(paletteRgb(15)).toBeNull();
    expect(paletteRgb(256)).toBeNull();
  });

  it("resolves greys by lightness and hues by angle", () => {
    expect(familyFromRgb([20, 20, 20], "fg")).toBe("black");
    expect(familyFromRgb([128, 128, 128], "fg")).toBe("dim");
    expect(familyFromRgb([128, 128, 128], "bg")).toBe("white");
    expect(familyFromRgb([230, 230, 230], "fg")).toBe("white");
    expect(familyFromRgb([255, 140, 0], "fg")).toBe("yellow");
    expect(familyFromRgb([250, 20, 60], "fg")).toBe("red");
  });

  it("reads anser class names", () => {
    expect(familyOf("ansi-bright-magenta", null, "fg")).toBe("magenta");
    expect(familyOf("ansi-truecolor", "0, 0, 255", "fg")).toBe("blue");
    expect(familyOf("ansi-truecolor", "nonsense", "fg")).toBeNull();
    expect(familyOf("ansi-unknown", null, "fg")).toBeNull();
    expect(familyOf(null, null, "fg")).toBeNull();
  });
});
