// OWNER: t1c (wave 1). Every chip in every state, as one sheet. /lab/t1c renders it in
// colour and again under `filter: grayscale(1)`: fill count, glyph and border style must
// carry every state on their own.
//
// Specimen scores are derived from the frozen SEVERITY_THRESHOLDS (each threshold and the
// value just below it), so the sheet also proves the ≥ semantics; nothing is typed by hand
// that a contract or fixture provides.
import {
  DeliveryModeChip,
  GateBlock,
  GateChip,
  ProofChip,
  SEVERITY_BANDS,
  STAGE_DOT_SIZES,
  SeverityMeter,
  StageDot,
  StatusBadge,
  bandForScore,
  formatScore,
} from "@/components/badges";
import { SEVERITY_THRESHOLDS } from "@/lib/contracts";
import type { ReactNode } from "react";
import { Panel, Specimen } from "./specimens";
import { DELIVERY_MODES, FINDING_STATUSES, GATE_READINGS, PROOF_STATUSES, STAGE_STATES } from "./states";

/**
 * The API's own gate.reason for a neutral gate (backend `routes_reviews._gate_reason`),
 * verbatim, so the specimen wraps the way the real block will.
 */
const NEUTRAL_REASON = "Nothing could be executed in this run, so nothing is claimed or blocked.";

/** 0.000, then every threshold and the score one step below it. */
export function specimenScores(): number[] {
  const out = [0];
  for (const t of Object.values(SEVERITY_THRESHOLDS)) out.push(+(t - 0.001).toFixed(3), t);
  return out;
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-rule-hair py-5 md:grid-cols-[10rem_1fr]">
      <h3 className="type-label text-text-dim">{title}</h3>
      <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-5">{children}</div>
    </div>
  );
}

export function BadgeSheet({ idPrefix }: { idPrefix: string }) {
  const scores = specimenScores();
  return (
    <Panel className="px-4 md:px-6">
      <Row title="proof_status">
        {PROOF_STATUSES.map((s) => (
          <Specimen key={s} caption={s}>
            <ProofChip status={s} />
          </Specimen>
        ))}
        <Specimen caption="disproven · caption">
          <ProofChip status="disproven" caption />
        </Specimen>
        <Specimen caption="inconclusive · reason">
          <ProofChip status="inconclusive" caption="a human must decide" />
        </Specimen>
      </Row>

      <Row title="severity · inline">
        {SEVERITY_BANDS.map((b) => {
          const score = scores.find((v) => bandForScore(v) === b) ?? 0;
          return (
            <Specimen key={b} caption={`band ${b}`}>
              <span className="type-data">
                <SeverityMeter score={score} band={b} density="inline" />
              </span>
            </Specimen>
          );
        })}
      </Row>

      <Row title="severity · glyph">
        {scores.map((v) => (
          <Specimen key={`${idPrefix}-${v}`} caption={`${formatScore(v)} → ${bandForScore(v)}`}>
            <SeverityMeter score={v} band={bandForScore(v)} density="glyph" />
          </Specimen>
        ))}
      </Row>

      <Row title="gate · chip">
        {GATE_READINGS.map((g) => (
          <Specimen key={String(g)} caption={g === null ? "null · undecided" : g}>
            <GateChip conclusion={g} />
          </Specimen>
        ))}
      </Row>

      <Row title="gate · block">
        <GateBlock conclusion="failure" blocking={1} delivery="check_run" announce={false} />
        <GateBlock conclusion="success" blocking={0} delivery="check_run" announce={false} />
        <GateBlock conclusion="neutral" reason={NEUTRAL_REASON} delivery="commit_status" announce={false} />
        <GateBlock conclusion={null} announce={false} />
      </Row>

      <Row title="finding status">
        {FINDING_STATUSES.map((s) => (
          <Specimen key={s} caption={s}>
            <StatusBadge status={s} />
          </Specimen>
        ))}
      </Row>

      <Row title="stage state">
        {STAGE_STATES.map((s) => (
          <Specimen key={s} caption={s}>
            {STAGE_DOT_SIZES.map((z) => (
              <StageDot key={z} state={s} size={z} />
            ))}
          </Specimen>
        ))}
      </Row>

      <Row title="delivery mode">
        {DELIVERY_MODES.map((m) => (
          <Specimen key={m} caption={m}>
            <DeliveryModeChip mode={m} />
          </Specimen>
        ))}
      </Row>
    </Panel>
  );
}
