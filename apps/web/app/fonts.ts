// OWNER: T0 (wave 0). FROZEN once T0 merges.
//
// Self-hosted with next/font/local — builds never touch the network.
// Both faces are variable (wght axis) and preload on every route, because both
// surfaces use both (design system §2.4). Budget ≤ 85 KB: 36,964 + 47,940 bytes.
//
// Provenance (subset once with fontTools 4.59 / pyftsubset, committed):
//   GoogleSansCode-VF-latin.woff2 — Google Sans Code v7.001 (OFL, ./OFL-GoogleSansCode.txt)
//     https://github.com/googlefonts/googlesans-code/releases/download/v7.001/GoogleSansCode-v7.001.zip
//     from "GoogleSansCode[MONO,wght].ttf": MONO pinned to 1 (monospace, 0.600em advance),
//     wght 300–800 kept, GPOS kern dropped (all 19,581 pairs are 0 at MONO=1, every weight).
//     Not the Google Fonts CSS API build: that one is v7.000.
//   InterVariable-latin.woff2 — Inter 4.1 (name table "4.001;git-9221beed3", OFL, ./OFL-Inter.txt)
//     https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
//     from "InterVariable.ttf": opsz pinned to 14, wght 100–900 kept, features
//     kern mark mkmk ccmp locl calt case tnum pnum zero cv05 cv11.
//     Not the Google Fonts build: its latin subset strips cv05, cv11 and zero,
//     which design §2.2 depends on.
//   Unicode: the Google Fonts "latin" range + arrows, math, ⌘ ⌥ ⇧ and the UI symbols
//   each face actually contains (GSC also: geometric shapes, block elements, light
//   box drawing). GSC has no ↻ ▶ ▣ ✓ ✗ Σ ⋯ ‖ ⚠ — in mono contexts those fall back.
//
// Fallback chains (brand-gaps §G) and the "Inter Fallback" size-adjust face live in
// app/tokens/core.css; adjustFontFallback is off for both so next/font does not add
// a second, computed fallback face.
import localFont from "next/font/local";

export const gsc = localFont({
  src: [{ path: "./fonts/GoogleSansCode-VF-latin.woff2", weight: "300 800", style: "normal" }],
  variable: "--font-gsc",
  display: "swap",
  preload: true,
  // Mono metrics differ too much from Arial for next/font's generated fallback.
  // These keep the baseline where the font's own metrics put it (0.34em above
  // the line box centre) while tightening the content box (design §2.4).
  adjustFontFallback: false,
  declarations: [
    { prop: "ascent-override", value: "92%" },
    { prop: "descent-override", value: "24%" },
  ],
});

export const inter = localFont({
  src: [{ path: "./fonts/InterVariable-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
});
