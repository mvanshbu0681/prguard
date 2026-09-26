"use client";
// OWNER: d5 (wave 3). /settings/policy — read-only policy (dashboard blueprint
// §2.12, brief): there is no settings endpoint (plan §13 A3), so nothing here
// is editable and every fact carries its own honest source — either a live
// query (the severity weights, off a real finding) or a cited section of the
// backend spec (the gate rule, risk tiers, proof settings), never an invented
// number.
import { EmptyState, ErrorState, LoadingState } from "@/components/app-shell";
import { formatScore } from "@/components/badges";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { ContributionBar } from "@/components/evidence/ContributionBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_IDS } from "@/lib/demo-ids";
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS, type SeverityInput } from "@/lib/contracts";
import { useFinding } from "@/lib/hooks";

const GATE_RULE = "blocking = proof_status: proven AND severity band >= high AND language: python AND status: published";

/** Band, its threshold, and the comparison a reader should make — low first, so the ladder reads bottom-up like the score itself. */
const BAND_ROWS: { band: string; threshold: number | null; rule: string }[] = [
  { band: "INFO", threshold: null, rule: "< 0.150" },
  { band: "LOW", threshold: SEVERITY_THRESHOLDS.low, rule: `>= ${formatScore(SEVERITY_THRESHOLDS.low)}` },
  { band: "MEDIUM", threshold: SEVERITY_THRESHOLDS.medium, rule: `>= ${formatScore(SEVERITY_THRESHOLDS.medium)}` },
  { band: "HIGH", threshold: SEVERITY_THRESHOLDS.high, rule: `>= ${formatScore(SEVERITY_THRESHOLDS.high)}` },
  { band: "CRITICAL", threshold: SEVERITY_THRESHOLDS.critical, rule: `>= ${formatScore(SEVERITY_THRESHOLDS.critical)}` },
];

const RISK_TIERS: { tier: string; changedLines: string; specialists: string }[] = [
  { tier: "TRIVIAL", changedLines: "<= 10 changed lines", specialists: "2 — bugs, security" },
  { tier: "STANDARD", changedLines: "<= 200 changed lines", specialists: "3 — + tests" },
  { tier: "FULL", changedLines: "otherwise, or any path matching auth/payments/crypto/migrations/PII", specialists: "4 — + quality" },
];

const PROOF_SETTINGS: { key: string; value: string }[] = [
  { key: "eligible categories", value: "correctness, security, test_integrity" },
  { key: "eligible language", value: "python" },
  { key: "PROOF_MIN_SCORE", value: formatScore(0.35) },
  { key: "PROOF_MAX_PER_RUN", value: "3" },
  { key: "PROOF_TIMEOUT", value: "90s" },
  { key: "DEP_INSTALL_TIMEOUT", value: "180s" },
  { key: "PROOF_REQUIRE_BASELINE", value: "true" },
  { key: "sandbox", value: "Docker (network none, 1 CPU, 1 GB) — subprocess fallback, isolation=degraded" },
];

export function PolicyRoute() {
  const finding = useFinding(DEMO_IDS.proven_finding_id);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="type-label text-text-dim">/ settings — policy</p>
        <h1 className="type-display-h3 text-text-primary">Policy</h1>
        <p className="type-small text-text-body">
          What decides whether a finding blocks a merge, and where each rule comes from. Read-only — there is no settings endpoint yet.
        </p>
      </header>

      <Surface elevation={2} variant="card" className="flex flex-col gap-3">
        <IndexStrip index="01" category="Gate rule" />
        <p className="type-data tabular text-text-primary [overflow-wrap:anywhere]">{GATE_RULE}</p>
        <p className="type-small text-text-body">Nothing else in the codebase may set `blocking`. Default `BLOCK_MIN_SEVERITY = high`.</p>
        <ProvenanceStrip source="the backend spec §4.4 — severity.is_blocking, the single source of truth" />
      </Surface>

      {finding.isPending ? (
        <LoadingState rows={4} label="Loading the demo finding's severity." />
      ) : finding.isError ? (
        <ErrorState error={finding.error} onRetry={() => finding.refetch()} />
      ) : !finding.data.severity ? (
        <EmptyState message="The demo finding carries no computed severity yet." />
      ) : (
        <section className="flex flex-col gap-3">
          <IndexStrip index="02" category="Severity weights" meta={<span className="type-chip tabular text-text-dim">weights sum to 1.000</span>} />
          <ContributionBar
            density="detail"
            withFrame
            index="02"
            findingId={finding.data.id}
            score={finding.data.severity.score}
            band={finding.data.severity.band}
            explanation={finding.data.severity.explanation}
            notes={finding.data.severity.notes}
            inputs={finding.data.severity.inputs}
            weights={weightsRecord(finding.data.severity.weights)}
          />
        </section>
      )}

      <Surface elevation={2} variant="panel" className="flex flex-col gap-3 p-4">
        <IndexStrip index="03" category="Band thresholds" />
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Band</TableHead>
              <TableHead>Threshold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAND_ROWS.map((row) => (
              <TableRow key={row.band}>
                <TableCell>{row.band}</TableCell>
                <TableCell className="tabular">{row.rule}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="type-small text-text-body">A disproven finding is clamped to info regardless of score.</p>
        <ProvenanceStrip source="@/lib/contracts → SEVERITY_THRESHOLDS (frozen client-side; mirrors core/severity.py, guarded by a test)" />
      </Surface>

      <Surface elevation={2} variant="panel" className="flex flex-col gap-3 p-4">
        <IndexStrip index="04" category="Risk tiers" />
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead>Changed lines</TableHead>
              <TableHead>Specialists</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RISK_TIERS.map((row) => (
              <TableRow key={row.tier}>
                <TableCell>{row.tier}</TableCell>
                <TableCell kind="prose">{row.changedLines}</TableCell>
                <TableCell kind="prose">{row.specialists}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ProvenanceStrip source="the backend spec §11.2, assumption 11" />
      </Surface>

      <Surface elevation={2} variant="panel" className="flex flex-col gap-3 p-4">
        <IndexStrip index="05" category="Proof settings" />
        <Table density="compact">
          <TableBody>
            {PROOF_SETTINGS.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="tabular">{row.key}</TableCell>
                <TableCell kind="prose" className="tabular">
                  {row.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ProvenanceStrip source="the backend spec §11.2, assumptions 7 and 8; §4.6" />
      </Surface>

      <Surface elevation={2} variant="panel" className="flex flex-col gap-2 p-4">
        <IndexStrip index="06" category="Governance" />
        <p className="type-data text-text-primary">The AI posts ONE GitHub review, event: COMMENT. Never APPROVE.</p>
        <p className="type-small text-text-body">
          Enforced in code. Guarded by <code className="type-chip">tests/test_governance_rail.py::test_ai_never_approves</code>.
        </p>
        <ProvenanceStrip source="the backend spec §4.7 — the literal strings APPROVE and REQUEST_CHANGES never appear in src/" />
      </Surface>

      <p className="type-small text-text-dim">Editing policy is not built for the beta.</p>
    </div>
  );
}

/** Reads every SEVERITY_INPUTS key off `severity.weights` (a loosely-typed `Record<string, number>` on the wire) into the strict Record<SeverityInput, number> <ContributionBar> wants — the values themselves are never invented, only the shape is narrowed. */
function weightsRecord(weights: Record<string, number>): Record<SeverityInput, number> {
  return Object.fromEntries(SEVERITY_INPUTS.map((key) => [key, weights[key] ?? 0])) as Record<SeverityInput, number>;
}
