// OWNER: d5 (wave 3). The brief's "policy weights come from data" test:
// <PolicyRoute> renders the demo finding's own severity.weights (via a
// mocked useFinding), never a copy typed into this file — an unusual weight
// value fed through the mock has to appear in the DOM for that to be true.
import "../../../../tests/unit/charts/dom-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Finding } from "@/lib/api-types";

const UNUSUAL_WEIGHT = 0.417;

const FINDING: Finding = {
  id: "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
  review_id: "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41",
  category: "correctness",
  rule_key: "null_currency",
  title: "Charge uses account currency without a null check",
  body_markdown: "…",
  location: { path: "app/billing.py", start_line: 1, end_line: 1 },
  status: "published",
  severity: {
    band: "critical",
    score: 0.81,
    inputs: { reachability: 1, blast_radius: 0.7, path_sensitivity: 1, coverage_gap: 0.5, churn: 0.3, proof_confidence: 1 },
    // path_sensitivity carries an unusual weight that is NOT the real .25 default —
    // if it shows up verbatim, the page is reading the mock, not a hard-coded table.
    weights: { reachability: 0.2, blast_radius: 0.15, path_sensitivity: UNUSUAL_WEIGHT, coverage_gap: 0.15, churn: 0.1, proof_confidence: 0.15 },
    explanation: "sensitive path × reachable × proven",
    notes: [],
  },
  proof: null,
} as unknown as Finding;

describe("PolicyRoute", () => {
  it("states the gate rule and the one-line beta note", async () => {
    vi.doMock("@/lib/hooks", () => ({ useFinding: () => ({ data: FINDING, isPending: false, isError: false }) }));
    const { PolicyRoute } = await import("./PolicyRoute");
    render(<PolicyRoute />);
    expect(screen.getByText(/blocking = proof_status: proven AND severity band >= high/)).toBeInTheDocument();
    expect(screen.getByText("Editing policy is not built for the beta.")).toBeInTheDocument();
    vi.resetModules();
    vi.doUnmock("@/lib/hooks");
  });

  it("renders the real finding's own severity.weights, not a value typed into this route", async () => {
    vi.doMock("@/lib/hooks", () => ({ useFinding: () => ({ data: FINDING, isPending: false, isError: false }) }));
    const { PolicyRoute } = await import("./PolicyRoute");
    render(<PolicyRoute />);
    expect(screen.getAllByText("0.417").length).toBeGreaterThan(0);
    // The provenance line is auto-derived by ContributionBar from findingId — it names the real endpoint, not an invented one.
    expect(screen.getByText(new RegExp(`GET /v1/findings/${FINDING.id} → severity`))).toBeInTheDocument();
    vi.resetModules();
    vi.doUnmock("@/lib/hooks");
  });

  it("loading and error states never leave the page blank", async () => {
    vi.doMock("@/lib/hooks", () => ({ useFinding: () => ({ isPending: true, isError: false }) }));
    const { PolicyRoute } = await import("./PolicyRoute");
    const { container } = render(<PolicyRoute />);
    expect(container.querySelector('[data-loading-state]')).not.toBeNull();
    vi.resetModules();
    vi.doUnmock("@/lib/hooks");
  });
});
