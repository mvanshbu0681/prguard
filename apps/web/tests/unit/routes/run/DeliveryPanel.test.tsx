// OWNER: d1 (wave 3). Regression coverage for the fe-d1 fix pass: the GATE LADDER's rung
// markers must use the project's own glyph components (SquareDot for the fired rung,
// paired with the font's own □ U+25A1 for the unfired ones — @/components/icons/glyphs.tsx),
// never the raw U+25A3 (▣) / U+25A2 (▢) Unicode characters Google Sans Code cannot render.
import "../../ui/dom-polyfills";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeliveryPanel } from "@/components/routes/run/DeliveryPanel";
import type { DeliveryInfo, GateInfo } from "@/lib/api-types";

const delivery: DeliveryInfo = {
  status: "posted",
  ladder_breakdown: { inline_exact: 1, inline_nearest: 1, file_level: 1, summary_only: 0 },
};

const gate: GateInfo = {
  conclusion: "failure",
  delivery: "commit_status",
  reason: "1 blocking finding",
};

describe("DeliveryPanel GATE LADDER glyphs", () => {
  it("never renders the raw U+25A3 (▣) / U+25A2 (▢) characters as a bare aria-hidden span — the pre-fix pattern", () => {
    const { container } = render(<DeliveryPanel delivery={delivery} gate={gate} published={3} provenance="GET /v1/reviews/x/result" />);
    const bareGlyphSpans = [...container.querySelectorAll('span[aria-hidden="true"]')].map((el) => el.textContent ?? "");
    expect(bareGlyphSpans.join("")).not.toContain("▣");
    expect(bareGlyphSpans).not.toContain("▢");
  });

  it("renders the fired rung (commit_status) with the SquareDot glyph (an <svg data-glyph>), not a bare character", () => {
    const { container } = render(<DeliveryPanel delivery={delivery} gate={gate} published={3} provenance="GET /v1/reviews/x/result" />);
    const firedGlyph = container.querySelector('[data-glyph="glyph-square-dot"]');
    expect(firedGlyph).not.toBeNull();
    expect(firedGlyph?.tagName.toLowerCase()).toBe("svg");
  });

  it("renders the unfired rungs with the font's own □ (U+25A1), not ▢ (U+25A2)", () => {
    const { getAllByText } = render(<DeliveryPanel delivery={delivery} gate={gate} published={3} provenance="GET /v1/reviews/x/result" />);
    // check_run and dry_run did not fire (gate.delivery is commit_status) — two rungs.
    const unfired = getAllByText("□", { selector: "span[aria-hidden]" });
    expect(unfired).toHaveLength(2);
  });
});
