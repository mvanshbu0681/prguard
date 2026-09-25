// OWNER: m5 (wave 3). <IdentityPanel> — the LEFT panel's rendering, against
// deterministic view models (build-view.test.ts already covers real-corpus shaping).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdentityPanel, type LedgerRowView, type OccurrenceView } from "@/components/sections/record/IdentityPanel";

const FINGERPRINT = "70f2459184df78fcdcbae1df66c153908fbaa353d9d8658c11b4b31d5d67333d";

const FIRST: OccurrenceView = {
  reviewId: "9beb6766-763b-46f5-b429-6858bc628aca",
  prNumber: 4821,
  prTitle: "Resolve account currency at charge time",
  runStatus: "cancelled",
  gateConclusion: null,
  createdAt: "2026-09-23T11:46:01.876000Z",
  filePath: "app/billing/charge.py",
  symbolPath: "app/billing/charge.py::charge",
  startLine: 39,
  endLine: 42,
  findingStatus: "proposed",
  proofStatus: "not_attempted",
  severityScore: 0.735,
  severityBand: "high",
  blocking: false,
};

const SECOND: OccurrenceView = {
  ...FIRST,
  reviewId: "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41",
  runStatus: "succeeded",
  gateConclusion: "failure",
  createdAt: "2026-09-23T11:46:28.228000Z",
  startLine: 41,
  endLine: 44,
  findingStatus: "published",
  proofStatus: "proven",
  severityScore: 0.81,
  severityBand: "critical",
  blocking: true,
};

const LEDGER: LedgerRowView[] = [
  {
    seq: 696,
    state: "suppressed",
    scope: "file",
    matchPath: "app/api/checkout.py",
    reason: "Display-only: the summary string is never parsed back.",
    createdBy: "priya-raman",
    createdAt: "2026-09-07T16:43:22.974770Z",
    expiresAt: null,
    revokedAt: null,
  },
  {
    seq: 804,
    state: "revoked",
    scope: "file",
    matchPath: "app/reports/export.py",
    reason: "The export is downloaded only by the finance team.",
    createdBy: "yuki-t",
    createdAt: "2026-09-08T12:53:08.268427Z",
    expiresAt: null,
    revokedAt: "2026-09-10T16:42:18.001800Z",
  },
];

function renderPanel(occurrences: OccurrenceView[] = [FIRST, SECOND], ledgerRows: LedgerRowView[] = LEDGER) {
  return render(
    <IdentityPanel fingerprint={FINGERPRINT} findingId="a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d" ruleKey="unguarded_none_attribute" occurrences={occurrences} ledgerRows={ledgerRows} />,
  );
}

describe("IdentityPanel — the fingerprint", () => {
  it("renders the fingerprint truncated, with the full value available on hover/copy", () => {
    renderPanel();
    const hash = screen.getByTitle(FINGERPRINT);
    expect(hash.textContent).toContain("70f24591…333d");
  });

  it("prints 'unchanged across both occurrences' for exactly two rows", () => {
    renderPanel();
    expect(screen.getByText(/unchanged across both occurrences/)).toBeInTheDocument();
  });

  it("prints 'all N occurrences' for a different count", () => {
    renderPanel([FIRST, SECOND, { ...SECOND, reviewId: "third-review" }]);
    expect(screen.getByText(/unchanged across all 3 occurrences/)).toBeInTheDocument();
  });

  it("renders one row per occurrence, each with its own line range and PR", () => {
    renderPanel();
    expect(screen.getByText(/line 39–42/)).toBeInTheDocument();
    expect(screen.getByText(/line 41–44/)).toBeInTheDocument();
    expect(screen.getAllByText(/PR #4821/)).toHaveLength(2);
  });

  it("marks the blocking occurrence, and only that one", () => {
    renderPanel();
    expect(screen.getAllByText("blocks merge")).toHaveLength(1);
  });
});

describe("IdentityPanel — the suppression ledger", () => {
  it("renders the active row's scope, reason, created_by and expiry", () => {
    renderPanel();
    expect(screen.getByText("suppressed")).toBeInTheDocument();
    expect(screen.getAllByText(/scope: file/)).toHaveLength(2);
    expect(screen.getByText(/app\/api\/checkout\.py/)).toBeInTheDocument();
    expect(screen.getByText(/no expiry/)).toBeInTheDocument();
    expect(screen.getByText(/priya-raman/)).toBeInTheDocument();
  });

  it("renders the revoked row struck through, still present — never removed", () => {
    renderPanel();
    const revokedLabel = screen.getByText("revoked");
    expect(revokedLabel).toHaveClass("line-through");
    expect(screen.getByText(/revoked 2026-09-10/)).toBeInTheDocument();
  });

  it("carries the fixed caption", () => {
    renderPanel();
    expect(screen.getByText("A revocation is itself an event. Nothing is ever deleted.")).toBeInTheDocument();
  });
});

describe("IdentityPanel — evidence framing", () => {
  it("names its endpoints in a provenance line for both panels (R10)", () => {
    renderPanel();
    expect(screen.getByText(/GET \/v1\/findings\/a91f3c2e → fingerprint · history/)).toBeInTheDocument();
    expect(within(document.body).getByText("GET /v1/suppressions")).toBeInTheDocument();
  });
});
