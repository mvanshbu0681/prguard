// OWNER: t1c (wave 1). SeverityMeter against §1.6 / §5.4 and R3: severity is never colour
// alone. Fill count = band rank, the score printed to 3 decimals, colour as the third cue.
import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SEVERITY_BANDS, SEVERITY_FILL, SeverityMeter, bandForScore, bandRank } from "@/components/badges";
import type { SeverityBand } from "@/lib/contracts";
import { tokenFor } from "./tokens";

function meter(score: number, band: SeverityBand, density: "inline" | "glyph" = "inline") {
  const { container, unmount } = render(<SeverityMeter score={score} band={band} density={density} />);
  const el = container.querySelector<HTMLElement>('[data-slot="severity-meter"]')!;
  const segments = [...el.querySelectorAll<HTMLElement>("[data-segment]")];
  return {
    el,
    unmount,
    segments,
    filled: segments.filter((s) => s.dataset.segment === "filled"),
    score: el.querySelector('[data-slot="severity-score"]')?.textContent ?? null,
    label: el.querySelector<HTMLElement>('[data-slot="severity-band"]')!,
  };
}

describe("SeverityMeter", () => {
  it("fills exactly bandRank(band) of five segments, for every band and both densities", () => {
    for (const band of SEVERITY_BANDS) {
      for (const density of ["inline", "glyph"] as const) {
        const m = meter(0.5, band, density);
        expect(m.segments).toHaveLength(5);
        expect(m.filled).toHaveLength(bandRank(band));
        expect(m.el.dataset.fill).toBe(String(bandRank(band)));
        // filled segments are the leading ones: the count reads left to right like a level
        expect(m.segments.map((s) => s.dataset.segment)).toEqual(Array.from({ length: 5 }, (_, i) => (i < bandRank(band) ? "filled" : "empty")));
        m.unmount();
      }
    }
  });

  it("takes the fill count from the band it is given, never from the score", () => {
    const m = meter(0.9, "low");
    expect(m.filled).toHaveLength(2);
  });

  it("colours only the filled segments, with the band's --sev-* token (the third cue)", () => {
    for (const band of SEVERITY_BANDS) {
      const m = meter(0.5, band);
      for (const s of m.filled) {
        expect(s.classList.contains(SEVERITY_FILL[band])).toBe(true);
        expect(tokenFor(s, "bg")).toBe(`--sev-${band}`);
      }
      for (const s of m.segments.filter((x) => x.dataset.segment === "empty")) expect(tokenFor(s, "bg")).toBe("--ink-5");
      m.unmount();
    }
  });

  it("always prints the score with 3 decimals (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (score) => {
        const m = meter(score, bandForScore(score));
        expect(m.score).toMatch(/^\d\.\d{3}$/);
        expect(m.score).toBe(score.toFixed(3) === "-0.000" ? "0.000" : score.toFixed(3));
        expect(m.el.getAttribute("aria-label")).toBe(`severity ${m.score}, ${bandForScore(score)}`);
        m.unmount();
      }),
      { numRuns: 200 },
    );
    expect(meter(0.81, "critical").score).toBe("0.810");
    expect(meter(0, "info").score).toBe("0.000");
    expect(meter(1, "critical").score).toBe("1.000");
  });

  it("prints the score in readout mono (500, --text-primary) and the band label in 11px mono caps", () => {
    const m = meter(0.81, "critical");
    const score = m.el.querySelector('[data-slot="severity-score"]')!;
    expect(score.className).toMatch(/\bfont-mono\b/);
    expect(score.className).toMatch(/\bfont-medium\b/);
    expect(tokenFor(score, "text")).toBe("--text-primary");
    expect(m.label.textContent).toBe("CRITICAL");
    expect(m.label.className).toMatch(/\btype-label\b/);
    expect(tokenFor(m.label, "text")).toBe("--text-dim");
  });

  it("never colours text with a band colour (--sev-critical is --alarm, fill-only)", () => {
    for (const band of SEVERITY_BANDS) {
      for (const density of ["inline", "glyph"] as const) {
        const m = meter(0.5, band, density);
        for (const el of [m.el, ...m.el.querySelectorAll("*")]) expect(tokenFor(el, "text") ?? "", el.className).not.toMatch(/^--sev-/);
        m.unmount();
      }
    }
  });

  it("glyph density: no printed score, the band letter, the full reading in its name", () => {
    const m = meter(0.749, "high", "glyph");
    expect(m.score).toBeNull();
    expect(m.label.textContent).toBe("H");
    expect(m.el.getAttribute("aria-label")).toBe("severity 0.749, high");
    expect(m.el.getAttribute("title")).toBe("0.749 · high");
    expect(m.el.getAttribute("role")).toBe("img");
  });

  it("keeps the fill count in forced-colors mode (filled = CanvasText, empty = outline)", () => {
    const m = meter(0.5, "medium");
    for (const s of m.filled) expect(s.className).toContain("forced-colors:bg-[CanvasText]");
    for (const s of m.segments.filter((x) => x.dataset.segment === "empty")) expect(s.className).toContain("forced-colors:border-[CanvasText]");
  });
});
