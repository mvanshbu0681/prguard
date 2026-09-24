// @vitest-environment node
// OWNER: m1 (wave 3). Section 01 — the server component itself (plan A7: "no number on
// any surface is hardcoded"; brief TESTS: "the calibration strip renders the fixture's
// three values with n; no hard-coded metric values in your files (grep)").
//
// `@/lib/fixtures` throws the moment `window` exists (it is server-only), so this file
// runs under the "node" environment (no jsdom `window`) and renders the section with
// `react-dom/server`'s `renderToStaticMarkup` rather than testing-library's `render`
// (which requires jsdom). `vi.mock("server-only", ...)` stands in for Next's compiler
// (fixtures.ts's own header comment; tests/unit/data/fixtures-on-disk.test.ts does the
// same). `@/*` only maps to `web/src/*` (tsconfig.json), so the section itself — under
// `app/(marketing)/_sections/` — is imported by relative path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { formatScore } from "@/components/badges";
import { getAccuracy, getDemoDisprovenFinding, getDemoProvenFinding, getManifest } from "@/lib/fixtures";
// @/* only maps to web/src/* (tsconfig.json); the section lives under app/, so it is
// imported by relative path.
import { Hero } from "../../../../app/(marketing)/_sections/01-hero";

const SECTION_FILE = path.join(process.cwd(), "app", "(marketing)", "_sections", "01-hero.tsx");
const BENCH_FILE = path.join(process.cwd(), "src", "components", "sections", "hero", "HeroBench.tsx");

describe("Hero — calibration strip (brand-gaps §2 ruling 11, plan A7)", () => {
  it("renders all three fixture metrics, each as its value (3dp) and its n", () => {
    const html = renderToStaticMarkup(<Hero />);
    const { precision_proxies } = getAccuracy();
    const metrics = [precision_proxies.execution_verified_precision, precision_proxies.self_caught_false_positive_rate, precision_proxies.human_dismissal_rate];

    for (const metric of metrics) {
      expect(html).toContain(formatScore(metric.value ?? Number.NaN));
      expect(html).toContain(`(n=${metric.n ?? 0})`);
    }
  });

  it("names every metric and prints the strip's own provenance", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(html).toContain("execution-verified precision");
    expect(html).toContain("self-caught false positives");
    expect(html).toContain("human dismissal");
    expect(html).toContain("GET /v1/accuracy");
  });

  it("three distinct rates render three distinct values — never the same number padded", () => {
    const { precision_proxies } = getAccuracy();
    const values = [
      precision_proxies.execution_verified_precision.value,
      precision_proxies.self_caught_false_positive_rate.value,
      precision_proxies.human_dismissal_rate.value,
    ];
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("Hero — the bench is wired from the fixture corpus (plan A10)", () => {
  it("the proven finding's identifier, SHAs and review provenance all come from the manifest", () => {
    const html = renderToStaticMarkup(<Hero />);
    const manifest = getManifest();
    const proven = getDemoProvenFinding();
    const review7 = manifest.ids.demo_review_id.slice(0, 7);

    expect(html).toContain(`finding ${proven.id.slice(0, 8)}`);
    expect(html).toContain(`GET /v1/reviews/${review7}/result → findings[0].proof`);
    expect(html).toContain(manifest.ids.base_sha.slice(0, 7));
    expect(html).toContain(manifest.ids.head_sha.slice(0, 7));
  });

  it("the disproven finding is loaded (for the D counter-demo) but not shown before any key is pressed", () => {
    const html = renderToStaticMarkup(<Hero />);
    const disproven = getDemoDisprovenFinding();
    expect(html).not.toContain(`finding ${disproven.id.slice(0, 8)}`);
    expect(html).not.toContain(disproven.title);
  });

  it("frame 0 is the money shot: verdict, proof status and the aria-live line are all present with zero JS", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(html).toContain("proof_status: proven");
    expect(html).toContain("blocks merge");
  });
});

describe("Hero / HeroBench — no hard-coded metric values (grep)", () => {
  it("neither file writes a literal 3-decimal score — every score comes from formatScore(data)", () => {
    for (const file of [SECTION_FILE, BENCH_FILE]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\b\d\.\d{3}\b/);
    }
  });

  it("the section never spells out the fixture's own formatted score as a literal", () => {
    const source = readFileSync(SECTION_FILE, "utf8");
    const { precision_proxies } = getAccuracy();
    for (const metric of [precision_proxies.execution_verified_precision, precision_proxies.self_caught_false_positive_rate, precision_proxies.human_dismissal_rate]) {
      if (typeof metric.value === "number") expect(source).not.toContain(formatScore(metric.value));
      if (typeof metric.n === "number") expect(source).not.toContain(`(n=${metric.n})`);
    }
  });

  it("the section never spells out the blueprint's own (impossible, plan A7) calibration numbers", () => {
    const source = readFileSync(SECTION_FILE, "utf8");
    for (const banned of ["0.91", "0.14", "0.07", "(n=312)", "(n=537)", "(n=284)"]) {
      expect(source).not.toContain(banned);
    }
  });
});
