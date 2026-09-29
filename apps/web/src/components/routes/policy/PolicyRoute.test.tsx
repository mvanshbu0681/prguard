// OWNER: d5 (wave 3). <PolicyRoute> reads its facts from data, never from
// copies typed into this file: the severity weights come off a real finding's
// own severity.weights (an unusual weight fed through the mocked useFinding has
// to appear verbatim), and the gate impact is recomputed from the published
// findings' own inputs. Editing only ever produces a local draft.
import "../../../../tests/unit/charts/dom-polyfills";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "@/lib/api-types";

const UNUSUAL_WEIGHT = 0.417;

const FINDING: Finding = {
  id: "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
  review_id: "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41",
  category: "correctness",
  rule_key: "null_currency",
  title: "Charge uses account currency without a null check",
  body_markdown: "…",
  location: { file_path: "app/billing.py", start_line: 1, end_line: 1, language: "python" },
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
  proof: { status: "proven" },
  created_at: "2026-09-20T10:00:00Z",
} as unknown as Finding;

const DEFAULT_WEIGHTS = { reachability: 0.2, blast_radius: 0.15, path_sensitivity: 0.25, coverage_gap: 0.15, churn: 0.1, proof_confidence: 0.15 };

/** A proven, published Python finding at a given score: its inputs make exactly that score under the default weights. */
function proven(id: string, review: string, score: number): Finding {
  return {
    ...FINDING,
    id,
    review_id: review,
    severity: { ...FINDING.severity!, score, weights: DEFAULT_WEIGHTS, inputs: { reachability: score, blast_radius: score, path_sensitivity: score, coverage_gap: score, churn: score, proof_confidence: score } },
  } as Finding;
}

// Two block at the default `high` (0.8 critical, 0.6 high); the 0.4 medium one would join them at `medium`.
const PUBLISHED = [proven("f1", "r1", 0.8), proven("f2", "r1", 0.6), proven("f3", "r2", 0.4), { ...proven("f4", "r3", 0.9), location: { file_path: "a.ts", language: "typescript" } } as Finding];

async function renderWith(finding: object, findings: object = { data: { items: PUBLISHED }, isPending: false, isError: false }) {
  vi.resetModules();
  vi.doMock("@/lib/hooks", () => ({
    useFinding: () => finding,
    useFindings: () => findings,
    findingsHref: (path: string) => path,
    auditHref: (path: string) => path,
  }));
  const { PolicyRoute } = await import("./PolicyRoute");
  const view = render(<PolicyRoute />);
  vi.doUnmock("@/lib/hooks");
  return view;
}

const LOADED = { data: FINDING, isPending: false, isError: false };

afterEach(() => sessionStorage.clear());

describe("PolicyRoute", () => {
  it("states the gate rule, and says plainly that edits are only a draft", async () => {
    await renderWith(LOADED);
    expect(screen.getByText(/blocking = proof_status: proven AND severity band >= high/)).toBeInTheDocument();
    expect(screen.getByText(/reads its policy from the environment/)).toBeInTheDocument();
  });

  it("renders the real finding's own severity.weights, not a value typed into this route", async () => {
    await renderWith(LOADED);
    expect(screen.getAllByText("0.417").length).toBeGreaterThan(0);
    // The provenance names the real endpoint the weights were read from.
    expect(screen.getByText(new RegExp(`GET /v1/findings/${FINDING.id} → severity`))).toBeInTheDocument();
    // 0.2 + 0.15 + 0.417 + 0.15 + 0.1 + 0.15 ≠ 1: the Σ badge says so rather than hiding it.
    expect(screen.getByText(/Σ = 1\.17/)).toBeInTheDocument();
  });

  it("recomputes what blocks from the findings' own inputs, and previews a draft threshold", async () => {
    await renderWith({ ...LOADED, data: { ...FINDING, severity: { ...FINDING.severity!, weights: DEFAULT_WEIGHTS } } });
    const impact = screen.getByText("Blocking today").parentElement!;
    // 0.8 and 0.6 block at high; the TypeScript finding never can.
    expect(within(impact).getByText("2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Block merges from this band up"), { target: { value: "2" } }); // medium
    expect(screen.getByText(/blocking = proof_status: proven AND severity band >= medium/)).toBeInTheDocument();
    expect(within(impact).getByText("Draft")).toBeInTheDocument();
    expect(within(impact).getByText("3")).toBeInTheDocument();
    // The dock appears with the change count; discarding restores the live rule.
    expect(screen.getByRole("region", { name: "Unsaved policy changes" })).toHaveTextContent("1 unsaved change");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("region", { name: "Unsaved policy changes" })).toBeNull();
    expect(screen.getByText(/severity band >= high/)).toBeInTheDocument();
  });

  it("will not save weights that do not sum to 1.00", async () => {
    await renderWith({ ...LOADED, data: { ...FINDING, severity: { ...FINDING.severity!, weights: DEFAULT_WEIGHTS } } });
    fireEvent.change(screen.getByLabelText("Churn weight"), { target: { value: "0.2" } });
    const dock = screen.getByRole("region", { name: "Unsaved policy changes" });
    expect(dock).toHaveTextContent(/Weights must sum to 1\.00/);
    expect(within(dock).getByRole("button", { name: /Save draft/ })).toBeDisabled();
  });

  it("loading and error states never leave the page blank", async () => {
    const { container } = await renderWith({ isPending: true, isError: false });
    expect(container.querySelector("[data-loading-state]")).not.toBeNull();
    expect(screen.getByText(/blocking = proof_status: proven/)).toBeInTheDocument();
  });
});

describe("PolicyRoute — the draft is not lost silently", () => {
  const DEFAULTS_LOADED = { ...LOADED, data: { ...FINDING, severity: { ...FINDING.severity!, weights: DEFAULT_WEIGHTS } } };

  it("an edit is written to sessionStorage and restored on the next visit", async () => {
    const first = await renderWith(DEFAULTS_LOADED);
    fireEvent.change(screen.getByLabelText("Block merges from this band up"), { target: { value: "4" } }); // critical
    expect(JSON.parse(sessionStorage.getItem("witness:policy-draft")!)).toEqual({ saved: {}, pending: { BLOCK_MIN_SEVERITY: "critical" } });
    first.unmount();

    await renderWith(DEFAULTS_LOADED);
    expect(await screen.findByRole("region", { name: "Unsaved policy changes" })).toHaveTextContent("1 unsaved change");
    expect(screen.getByText(/severity band >= critical/)).toBeInTheDocument();
  });

  it("a saved draft comes back as saved, with the way back to live", async () => {
    sessionStorage.setItem("witness:policy-draft", JSON.stringify({ saved: { REVIEW_DRAFT_PRS: true }, pending: {} }));
    await renderWith(DEFAULTS_LOADED);
    expect(await screen.findByText("Draft saved · not applied")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Review draft pull requests" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /Reset to live/ }));
    expect(sessionStorage.getItem("witness:policy-draft")).toBeNull();
  });

  it("leaving with unsaved edits asks first", async () => {
    await renderWith(DEFAULTS_LOADED);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByRole("switch", { name: "Review draft pull requests" }));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
