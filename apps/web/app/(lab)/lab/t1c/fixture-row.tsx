// OWNER: t1c (wave 1). The chips fed by the fixture corpus (plan A10: one story everywhere).
// Reads web/public/fixtures at render time. Until t2b generates the corpus the files are
// stubs, and this says so rather than inventing values. Shapes are narrowed by hand here:
// src/lib/api-types.ts is still `unknown` in wave 1.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DELIVERY_MODE,
  DeliveryModeChip,
  FINDING_STATUS,
  GateBlock,
  PROOF_CHIP,
  ProofChip,
  SEVERITY_BANDS,
  SeverityMeter,
  StatusBadge,
  type GateDelivery,
  type GateReading,
} from "@/components/badges";
import type { DeliveryMode, FindingStatus, ProofStatus, SeverityBand } from "@/lib/contracts";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, keys: readonly string[]): T | null => (typeof v === "string" && keys.includes(v) ? (v as T) : null);

function readFixture(rel: string): unknown {
  try {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "fixtures", rel);
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
  } catch {
    return null;
  }
}

type Row = {
  role: string;
  id: string;
  title: string;
  severity: { score: number; band: SeverityBand } | null;
  proof: ProofStatus | null;
  status: FindingStatus | null;
  delivery: DeliveryMode | null;
};

function findingRow(role: string, id: string, f: Json): Row {
  const sev = isObj(f.severity) ? f.severity : null;
  const band = sev ? oneOf<SeverityBand>(sev.band, SEVERITY_BANDS) : null;
  return {
    role,
    id,
    title: typeof f.title === "string" ? f.title : "",
    severity: sev && band && typeof sev.score === "number" ? { score: sev.score, band } : null,
    proof: isObj(f.proof) ? oneOf<ProofStatus>(f.proof.status, Object.keys(PROOF_CHIP)) : null,
    status: oneOf<FindingStatus>(f.status, Object.keys(FINDING_STATUS)),
    delivery: isObj(f.delivery) ? oneOf<DeliveryMode>(f.delivery.mode, Object.keys(DELIVERY_MODE)) : null,
  };
}

export function FixtureRow() {
  const manifest = readFixture("manifest.json");
  const ids = isObj(manifest) && isObj(manifest.ids) ? manifest.ids : {};
  const findings = readFixture("findings/index.json");
  const items = isObj(findings) && Array.isArray(findings.items) ? findings.items.filter(isObj) : [];

  const wanted: [string, unknown][] = [
    ["proven", ids.proven_finding_id],
    ["disproven", ids.disproven_finding_id],
    ["inconclusive", ids.inconclusive_finding_id],
  ];
  const rows = wanted.flatMap(([role, id]) => {
    const f = typeof id === "string" ? items.find((x) => x.id === id) : undefined;
    return f && typeof id === "string" ? [findingRow(role, id, f)] : [];
  });

  const reviewId = typeof ids.demo_review_id === "string" ? ids.demo_review_id : null;
  const result = reviewId ? readFixture(`reviews/${reviewId}.result.json`) : null;
  const gate = isObj(result) && isObj(result.gate) ? result.gate : null;
  const conclusion = gate ? oneOf<NonNullable<GateReading>>(gate.conclusion, ["failure", "neutral", "success"]) : null;

  if (rows.length === 0 && !conclusion) {
    return (
      <p className="type-data text-text-dim">
        public/fixtures/findings/index.json holds no demo findings yet (the corpus is t2b&apos;s). The sheets above use values derived from
        SEVERITY_THRESHOLDS and the contract enums.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <ul className="min-w-0 border-y border-rule-hair">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-2 border-b border-rule-hair py-3 last:border-b-0">
            <p className="type-data text-text-dim [overflow-wrap:anywhere]">
              finding {r.id.slice(0, 8)} · {r.role} · <span className="font-sans text-text-body">{r.title}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {r.severity ? (
                <span className="type-data">
                  <SeverityMeter score={r.severity.score} band={r.severity.band} />
                </span>
              ) : null}
              {r.proof ? <ProofChip status={r.proof} caption={r.proof === "disproven" ? true : undefined} /> : null}
              {r.status ? <StatusBadge status={r.status} /> : null}
              {r.delivery ? <DeliveryModeChip mode={r.delivery} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {gate && conclusion ? (
        <div className="flex flex-col gap-3">
          <p className="type-label text-text-dim">review {reviewId?.slice(0, 7)} · gate</p>
          <GateBlock
            conclusion={conclusion}
            blocking={Array.isArray(gate.blocking_finding_ids) ? gate.blocking_finding_ids.length : undefined}
            delivery={oneOf<GateDelivery>(gate.delivery, ["check_run", "commit_status", "dry_run"])}
            reason={typeof gate.reason === "string" && gate.reason ? gate.reason : undefined}
            announce={false}
          />
          <p className="type-data text-text-dim [overflow-wrap:anywhere]">GET /v1/reviews/{reviewId?.slice(0, 7)}/result → gate</p>
        </div>
      ) : null}
    </div>
  );
}
