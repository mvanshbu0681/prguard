// OWNER: t1d (wave 1). Captured output → styled spans, via anser with use_classes: true.
//
// Every style is a CLASS (prg-ansi-*), never an inline colour: code.css maps the classes
// onto the quarantined ANSI palette (design §1.12), so a token change or the
// data-contrast="high" variant re-themes captured output with no re-render.
//
//   SGR 30–37 / 90–97   prg-ansi-fg-<family>      normal and bright share a token (§1.12)
//   SGR 40–47 / 100–107 prg-ansi-bg-<family>
//   38;5;n / 48;5;n     nearest family            (the palette has no hue for n ≥ 16)
//   38;2;r;g;b          nearest family            (truecolor is never passed through)
//   1 2 3 4 9 8         bold dim italic underline strike hidden
//   5 (blink)           dropped: nothing on this product flashes (design §8.8)
//   7 (reverse)         anser swaps fg/bg before we see it
// Mid greys from the extended palettes read as `dim` rather than black-on-black.
//
// The backend normalises \r rewrites, erase-line and cursor movement at capture (§1.12).
// This module is still defensive: OSC strings, charset and two-byte escapes are
// stripped here, anser drops every non-SGR CSI sequence, and the line composer
// (model.ts) resolves any \r or \b that survived.
import Anser from "anser";

export const ANSI_FAMILIES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
export type AnsiFamily = (typeof ANSI_FAMILIES)[number];

export interface AnsiSpan {
  text: string;
  /** prg-ansi-* classes, in a stable order: fg, bg, then decorations. */
  classes: string[];
}

const DECORATION_CLASS: Readonly<Record<string, string>> = {
  bold: "prg-ansi-bold",
  dim: "prg-ansi-dim",
  italic: "prg-ansi-italic",
  underline: "prg-ansi-underline",
  strikethrough: "prg-ansi-strike",
  hidden: "prg-ansi-hidden",
};

/** OSC: ESC ] … terminated by BEL or ST (ESC \). Hyperlinks, window titles. */
const OSC = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
/** Charset designation (ESC ( B …) and two-byte Fp/Fe/Fs escapes (ESC 7, ESC =, ESC M, ESC c …),
 *  everything anser would print raw because it only splits on CSI ("ESC ["). */
const OTHER_ESCAPES = /\x1b(?:[()*+\-./][\x20-\x7e]|[\x30-\x5a\x5c-\x7e])/g;
/** 8-bit CSI, rewritten to its 7-bit form so anser parses it. */
const CSI_8BIT = /\x9b/g;
/** C0 controls left after parsing. Keeps \t \n \r and \b: the line composer resolves the last two. */
const STRAY_CONTROLS = /[\x00-\x07\x0b\x0c\x0e-\x1f\x7f]/g;

const XTERM_CUBE = [0, 95, 135, 175, 215, 255] as const;

type Rgb = readonly [number, number, number];

/** xterm-256 index → RGB, for indices anser does not already map to a base class (n ≥ 16). */
export function paletteRgb(index: number): Rgb | null {
  if (!Number.isInteger(index) || index < 16 || index > 255) return null;
  if (index <= 231) {
    const i = index - 16;
    return [XTERM_CUBE[Math.floor(i / 36)], XTERM_CUBE[Math.floor(i / 6) % 6], XTERM_CUBE[i % 6]];
  }
  const v = 8 + 10 * (index - 232);
  return [v, v, v];
}

const HUE_FAMILIES: readonly (readonly [number, AnsiFamily])[] = [
  [0, "red"],
  [60, "yellow"],
  [120, "green"],
  [180, "cyan"],
  [240, "blue"],
  [300, "magenta"],
  [360, "red"],
];

/** Nearest of the eight families for an arbitrary colour. Near-greys resolve by lightness:
 *  dark → black, light → white, and (foreground only) the middle → "dim". */
export function familyFromRgb([r, g, b]: Rgb, layer: "fg" | "bg"): AnsiFamily | "dim" {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const light = (max + min) / 2;
  if (chroma < 48) {
    if (light < 64) return "black";
    if (light >= 192) return "white";
    if (layer === "bg") return light < 128 ? "black" : "white";
    return "dim";
  }
  let h: number;
  if (max === r) h = ((g - b) / chroma + 6) % 6;
  else if (max === g) h = (b - r) / chroma + 2;
  else h = (r - g) / chroma + 4;
  const hue = h * 60;
  let best: AnsiFamily = "red";
  let bestDistance = Infinity;
  for (const [angle, family] of HUE_FAMILIES) {
    const d = Math.abs(hue - angle);
    if (d < bestDistance) {
      bestDistance = d;
      best = family;
    }
  }
  return best;
}

function parseTruecolor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return [parts[0], parts[1], parts[2]];
}

/** anser's class name (+ its truecolor side value) → a family, "dim", or nothing. */
export function familyOf(ansiClass: string | null | undefined, truecolor: string | null | undefined, layer: "fg" | "bg"): AnsiFamily | "dim" | null {
  if (!ansiClass) return null;
  if (ansiClass === "ansi-truecolor") {
    const rgb = parseTruecolor(truecolor);
    return rgb ? familyFromRgb(rgb, layer) : null;
  }
  const palette = /^ansi-palette-(\d+)$/.exec(ansiClass);
  if (palette) {
    const rgb = paletteRgb(Number(palette[1]));
    return rgb ? familyFromRgb(rgb, layer) : null;
  }
  const base = /^ansi-(?:bright-)?([a-z]+)$/.exec(ansiClass);
  if (base && (ANSI_FAMILIES as readonly string[]).includes(base[1])) return base[1] as AnsiFamily;
  return null;
}

/** Strip the escape sequences anser does not understand. Exported for tests. */
export function stripForeignEscapes(input: string): string {
  return input.replace(CSI_8BIT, "\x1b[").replace(OSC, "").replace(OTHER_ESCAPES, "");
}

/** Parse captured output into spans carrying prg-ansi-* classes. Newlines stay in the text;
 *  splitting into lines is the model's job. */
export function parseAnsi(input: string): AnsiSpan[] {
  if (!input) return [];
  const cleaned = stripForeignEscapes(input);
  // A fresh options object every call: anser writes into it.
  const entries = Anser.ansiToJson(cleaned, { use_classes: true, remove_empty: true });
  const spans: AnsiSpan[] = [];
  for (const e of entries) {
    const text = e.content.replace(STRAY_CONTROLS, "");
    if (!text) continue;
    const classes: string[] = [];
    // anser never resets fg_truecolor, so only read it when this entry IS truecolor.
    const fg = familyOf(e.fg, e.fg === "ansi-truecolor" ? e.fg_truecolor : null, "fg");
    const bg = familyOf(e.bg, e.bg === "ansi-truecolor" ? e.bg_truecolor : null, "bg");
    if (fg === "dim") classes.push("prg-ansi-dim");
    else if (fg) classes.push(`prg-ansi-fg-${fg}`);
    if (bg && bg !== "dim") classes.push(`prg-ansi-bg-${bg}`);
    for (const d of e.decorations ?? []) {
      const cls = DECORATION_CLASS[d];
      if (cls && !classes.includes(cls)) classes.push(cls);
    }
    const prev = spans[spans.length - 1];
    if (prev && sameClasses(prev.classes, classes)) prev.text += text;
    else spans.push({ text, classes });
  }
  return spans;
}

export function sameClasses(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}
