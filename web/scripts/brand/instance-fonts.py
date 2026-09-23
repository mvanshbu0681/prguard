"""Static Google Sans Code instances for the OG card (app/og/fonts/*.ttf).

OWNER: t1a (wave 1).

Satori (next/og) cannot read woff2 and ignores the variable `wght` axis, so the
card needs plain TTF instances at fixed weights (brand-gaps §C):
  400 — terminal lines and the provenance-grade text
  520 — the headline, the hero's display weight (design §2.3)
  560 — the wordmark (brand-gaps §B) and the section-head weight
Every other weight the card asks for resolves to the nearest of these three.

Source: app/fonts/GoogleSansCode-VF-latin.woff2 (T0's committed subset of
Google Sans Code v7.001, OFL — app/fonts/OFL-GoogleSansCode.txt). No network,
no new glyphs: the instances carry exactly the subset's cmap.

Run from web/ (uv fetches fonttools + brotli into a throwaway environment):
  uv run --with fonttools --with brotli python scripts/brand/instance-fonts.py

It also prints the side bearings of "P" and "D" at 560, which size Lockup B's
rail to the wordmark's ink width (src/components/brand/metrics.ts).
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WEB = Path(__file__).resolve().parents[2]
SOURCE = WEB / "app" / "fonts" / "GoogleSansCode-VF-latin.woff2"
OUT = WEB / "app" / "og" / "fonts"
WEIGHTS = (400, 520, 560)


def bearings(font: TTFont, char: str) -> tuple[int, int, int]:
    glyph_name = font.getBestCmap()[ord(char)]
    advance, lsb = font["hmtx"][glyph_name]
    glyph = font["glyf"][glyph_name]
    glyph.recalcBounds(font["glyf"])
    rsb = advance - glyph.xMax
    return advance, glyph.xMin, rsb


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        # recalcTimestamp=False: save() would otherwise stamp head.modified with
        # the current time and every run would produce different bytes.
        font = TTFont(SOURCE, recalcTimestamp=False)
        static = instantiateVariableFont(font, {"wght": weight}, inplace=False, updateFontNames=False)
        static.flavor = None  # woff2 -> plain sfnt, which is what Satori parses
        target = OUT / f"GoogleSansCode-{weight}.ttf"
        static.save(target, reorderTables=True)
        upm = static["head"].unitsPerEm
        p_adv, p_lsb, _ = bearings(static, "P")
        d_adv, _, d_rsb = bearings(static, "D")
        print(f"{target.relative_to(WEB)}  {target.stat().st_size:>6} B  upm={upm}  "
              f"P lsb={p_lsb} ({p_lsb / upm:.4f}em)  D rsb={d_rsb} ({d_rsb / upm:.4f}em)  adv={p_adv}")


if __name__ == "__main__":
    main()
