// @vitest-environment node
// OWNER: m2 (wave 3). Section 03 — WE WERE WRONG — against the track brief's own
// TESTS line: "the verbatim line is present; the rate and n come from the
// fixture; the legend shows all four states."
//
// `renderToStaticMarkup` under Vitest's `node` environment, not `render()` +
// jsdom: this section is a SERVER component whose import graph reaches
// src/lib/fixtures.ts's `import "server-only"`, and `vi.mock("server-only")`
// only takes effect under the `node` environment in this project's Vite/Vitest
// setup (proven against tests/unit/data/fixtures-on-disk.test.ts and
// tests/unit/evidence/contribution-bar/geometry.test.ts, the two other places
// this codebase mocks it — both `@vitest-environment node`; jsdom hits the
// import-analysis plugin before the mock ever applies, unrelated to this
// track). A static HTML string is exactly what a server component's own
// contract promises (LANDING-PAGE RULES: "the page must render COMPLETE
// content at first paint — server HTML"), so this is not a workaround, it is
// the more faithful assertion.
import { describe, expect, it, vi } from "vitest";

// Next implements `import "server-only"` in its compiler; vitest has no such module.
vi.mock("server-only", () => ({}));

import { renderToStaticMarkup } from "react-dom/server";
import { formatScore } from "@/components/badges";
import { WeWereWrong } from "../../../../app/(marketing)/_sections/03-we-were-wrong";
import { getAccuracy, getDemoDisprovenFinding } from "@/lib/fixtures";

// brand-gaps §D "Fixed copy — do not paraphrase": this exact sentence must appear
// verbatim wherever the false-positive rate is shown.
const FIXED_LINE = "That is the rate at which the system caught itself before the claim reached your pull request.";

function html(): string {
  return renderToStaticMarkup(WeWereWrong());
}

describe("WeWereWrong (section 03)", () => {
  it("keeps the section id `wrong` the frozen page.tsx and the nav rely on", () => {
    expect(html()).toContain('id="wrong"');
  });

  it("prints brand-gaps §D's fixed self-refutation line verbatim", () => {
    expect(html()).toContain(FIXED_LINE);
  });

  it("renders self_caught_false_positive_rate's value and n straight from the fixture, never hard-coded", () => {
    const metric = getAccuracy().precision_proxies.self_caught_false_positive_rate;
    expect(metric.value).not.toBeNull();
    const out = html();
    // 3 decimals always (brand-gaps §D numeric style), and the value never bare — every
    // rate carries its n right beside it.
    expect(out).toContain(formatScore(metric.value!));
    expect(out).toContain(`n = ${metric.n}`);
    expect(out).toContain(metric.definition);
    expect(out).toContain("self_caught_false_positive_rate");
    // A6: disproven_rate is the same quantity and must not be published a second time.
    expect(out).not.toContain("disproven_rate");
  });

  it("shows the demo disproven finding's own claim, struck through, not invented copy", () => {
    const disproven = getDemoDisprovenFinding();
    const out = html();
    expect(out).toContain(disproven.title);
    // The claim sits in the one <p> this track's <StruckClaim> renders with line-through.
    const claimIndex = out.indexOf(disproven.title);
    const tagStart = out.lastIndexOf("<p ", claimIndex);
    expect(out.slice(tagStart, claimIndex)).toMatch(/line-through/);
  });

  it("folds all four proof states into the legend, each as its own chip", () => {
    const out = html();
    for (const status of ["proven", "disproven", "inconclusive", "not_attempted"]) {
      expect(out).toContain(`data-status="${status}"`);
    }
    // The required explanation of the shared cyan hue (track brief: "explaining why
    // proven and disproven share the cyan hue — that explanation is required").
    expect(out).toMatch(/share the cyan hue/i);
  });

  it("names the finding's real API path in the bench's provenance line, not a placeholder", () => {
    const disproven = getDemoDisprovenFinding();
    expect(html()).toContain(`GET /v1/findings/${disproven.id.slice(0, 8)} → proof`);
  });
});
