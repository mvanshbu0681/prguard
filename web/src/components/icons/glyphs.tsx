// OWNER: t1c (wave 1). Inline replacements for the characters Google Sans Code does not
// contain: ▶ ↻ ✓ ✗ ⚠ ⋯ Σ ‖ (plan A15; verified against app/fonts/GoogleSansCode-VF-latin.woff2).
// Left to the browser, each of these falls back to a system font mid-line: a different
// weight, a different width, and a broken monospace column. Drawn here instead.
//
// Metrics are GSC's own (unitsPerEm 2000 → a 12 × 20 cell): advance 0.6em, cap height
// 0.716em, math axis 0.3125em (the centre of `−`), round dots 0.1275em across (from `…`),
// stems 0.085–0.096em. So a glyph set inside `9c2d4b1 ‖ 7c41a09` occupies exactly one
// column and matches the text's weight at any size.
//
// Usage: <Play /> PLAY · <Restore /> restore · <Sigma /> · prev_hash <DoubleBar /> canonical_json
// `✓` marks a computed equality (chain verified). It is never a "pass" mark on a gate or a
// proof chip — those states have their own glyphs (GateGlyph, ProofMark).
import type { ReactNode } from "react";
import { GLYPH_CELL, GlyphSvg, type GlyphSvgProps } from "./svg";

type Props = Omit<GlyphSvgProps, "char" | "glyph" | "children" | "speak"> & {
  /** Override the default: keep the Unicode character in the text for copy-paste and AT. */
  speak?: boolean;
};

const FILL = { fill: "currentColor", stroke: "none" } as const;
const { capMid, mathAxis } = GLYPH_CELL;

type GlyphDef = { char: string; name: string; speak: boolean; draw: ReactNode };

export const GLYPH_DEFS = {
  play: {
    char: "▶",
    name: "play",
    speak: false,
    draw: <path {...FILL} d={`M1 ${capMid - 6}L11.4 ${capMid}L1 ${capMid + 6}Z`} />,
  },
  restore: {
    char: "↻",
    name: "restore",
    speak: false,
    draw: (
      <g>
        <path d="M8.1 6.713A4.2 4.2 0 1 1 3.9 6.713" />
        <path d="M1.6 5.3L4.75 6.2L3.9 9.35" />
      </g>
    ),
  },
  check: {
    char: "✓",
    name: "check",
    speak: false,
    draw: <path d="M1.4 10.9L4.5 14.9L10.6 4.7" />,
  },
  cross: {
    char: "✗",
    name: "cross",
    speak: false,
    draw: <path d={`M2 ${capMid - 4.5}L10 ${capMid + 4.5}M10 ${capMid - 4.5}L2 ${capMid + 4.5}`} />,
  },
  warn: {
    // A solid triangle from the baseline to the cap height with the exclamation knocked
    // out (even-odd), in GSC's own ▲ ■ vocabulary. An outlined triangle reads as Δ at the
    // 11–12px sizes this glyph is used at (input errors, labels); the solid one reads as ⚠.
    char: "⚠",
    name: "warn",
    speak: false,
    draw: <path {...FILL} fillRule="evenodd" d="M6 3.2L11.2 17.5H0.8ZM5.1 7.6H6.9V12.8H5.1ZM5 15.1A1 1 0 1 0 7 15.1A1 1 0 1 0 5 15.1Z" />,
  },
  ellipsis: {
    char: "⋯",
    name: "ellipsis",
    speak: true,
    draw: (
      <g {...FILL}>
        <circle cx={2} cy={mathAxis} r={1.25} />
        <circle cx={6} cy={mathAxis} r={1.25} />
        <circle cx={10} cy={mathAxis} r={1.25} />
      </g>
    ),
  },
  sigma: {
    char: "Σ",
    name: "sigma",
    speak: true,
    draw: (
      <g>
        <rect {...FILL} x={1.7} y={3.18} width={8.7} height={1.75} />
        <rect {...FILL} x={1.7} y={15.75} width={8.7} height={1.75} />
        <path d={`M2.45 4.3L6.4 ${capMid}L2.45 16.4`} />
      </g>
    ),
  },
  doubleBar: {
    char: "‖",
    name: "double-bar",
    speak: true,
    draw: <path d="M4.25 0V20M7.75 0V20" />,
  },
} satisfies Record<string, GlyphDef>;

export type GlyphName = keyof typeof GLYPH_DEFS;

function make(key: GlyphName) {
  const def: GlyphDef = GLYPH_DEFS[key];
  function Glyph({ speak, ...props }: Props) {
    return (
      <GlyphSvg char={def.char} glyph={`glyph-${def.name}`} speak={speak ?? def.speak} {...props}>
        {def.draw}
      </GlyphSvg>
    );
  }
  Glyph.displayName = key[0].toUpperCase() + key.slice(1);
  return Glyph;
}

/** ▶ — for replay controls (`▶ PLAY`). Decorative by default. */
export const Play = make("play");
/** ↻ — for `↻ restore` in the tamper control. Decorative by default. */
export const Restore = make("restore");
/** ✓ — a computed equality held (`== event_hash ✓ verified`). Never a gate or proof "pass". */
export const Check = make("check");
/** ✗ — a computed equality failed. Decorative by default. */
export const Cross = make("cross");
/** ⚠ — the 12px alert glyph on input errors (§5.2). Decorative by default. */
export const Warn = make("warn");
/** ⋯ — midline ellipsis. Keeps the character for copy-paste. */
export const Ellipsis = make("ellipsis");
/** Σ — the sum row of the severity table. Keeps the character for copy-paste. */
export const Sigma = make("sigma");
/** ‖ — concatenation in `sha256(prev_hash ‖ canonical_json)`. Keeps the character for copy-paste. */
export const DoubleBar = make("doubleBar");
