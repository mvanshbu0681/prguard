"use client";
// OWNER: t1c (wave 1). /lab/t1c — the 0ms rule, live. Each button advances one chip to its
// next state: the colour flips with no transition, and the chip re-mounts carrying the class
// `stamp` (track t3's 180ms scale; a no-op until t3 lands). `S` advances everything.
import { useEffect, useState, type ReactNode } from "react";
import { DeliveryModeChip, GateBlock, GateChip, ProofChip, SEVERITY_BANDS, SeverityMeter, StageDot, StatusBadge } from "@/components/badges";
import { SEVERITY_THRESHOLDS, type SeverityBand } from "@/lib/contracts";
import { DELIVERY_MODES, FINDING_STATUSES, GATE_READINGS, PROOF_STATUSES, STAGE_STATES } from "./states";

/** A score inside each band: the band's own threshold (info: 0). */
const BAND_SCORE: Record<SeverityBand, number> = { info: 0, ...SEVERITY_THRESHOLDS };

type Counts = { proof: number; gate: number; status: number; stage: number; delivery: number; band: number };
const ZERO: Counts = { proof: 0, gate: 0, status: 0, stage: 0, delivery: 0, band: 0 };
const advanceAll = (c: Counts): Counts => ({
  proof: c.proof + 1,
  gate: c.gate + 1,
  status: c.status + 1,
  stage: c.stage + 1,
  delivery: c.delivery + 1,
  band: c.band + 1,
});

const BUTTON =
  "inline-flex h-8 shrink-0 items-center rounded-data border border-rule-2 bg-ink-2 px-4 type-label text-text-body hover:border-rule-3 hover:bg-ink-3 active:translate-y-[0.5px]";

export function StampDemo() {
  const [n, setN] = useState<Counts>(ZERO);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "s" && e.key !== "S") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      setN(advanceAll);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = <T,>(list: readonly T[], i: number) => list[i % list.length];
  const proof = pick(PROOF_STATUSES, n.proof);
  const gate = pick(GATE_READINGS, n.gate);
  const status = pick(FINDING_STATUSES, n.status);
  const stage = pick(STAGE_STATES, n.stage);
  const mode = pick(DELIVERY_MODES, n.delivery);
  const band = pick(SEVERITY_BANDS, n.band);

  const rows: { key: keyof Counts; label: string; value: string; chip: ReactNode }[] = [
    { key: "proof", label: "proof_status", value: proof, chip: <ProofChip status={proof} /> },
    { key: "gate", label: "gate", value: gate ?? "null", chip: <GateChip conclusion={gate} /> },
    { key: "status", label: "status", value: status, chip: <StatusBadge status={status} /> },
    { key: "stage", label: "stage", value: stage, chip: <StageDot state={stage} size={12} /> },
    { key: "delivery", label: "delivery.mode", value: mode, chip: <DeliveryModeChip mode={mode} /> },
    {
      key: "band",
      label: "severity.band",
      value: band,
      chip: (
        <span className="type-data">
          <SeverityMeter score={BAND_SCORE[band]} band={band} />
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className={BUTTON} onClick={() => setN(advanceAll)} aria-keyshortcuts="S">
            Advance all
          </button>
          <span className="type-data text-text-dim">
            or press <kbd className="rounded-data border border-rule-2 px-1 font-mono text-text-body">S</kbd>
          </span>
        </div>
        <ul className="border-y border-rule-hair">
          {rows.map((r) => (
            <li
              key={r.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule-hair py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
            >
              <span className="col-span-2 type-label text-text-dim sm:col-span-1">{r.label}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-3">
                {r.chip}
                <span className="type-data text-text-dim">
                  {r.value} · changes {n[r.key]}
                </span>
              </span>
              <button
                type="button"
                className={BUTTON}
                aria-label={`Next ${r.label}`}
                onClick={() => setN((c) => ({ ...c, [r.key]: c[r.key] + 1 }))}
              >
                Next
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="type-label text-text-dim">gate block · announces on change</p>
        <GateBlock conclusion={gate} blocking={gate === "failure" ? 1 : 0} delivery={gate === null ? null : "check_run"} />
        <p className="type-small text-text-dim">
          The block carries the product&apos;s only <code className="font-mono">role=&quot;alert&quot;</code>. It is empty at first paint and
          speaks only when the gate turns BLOCKED.
        </p>
      </div>
    </div>
  );
}
