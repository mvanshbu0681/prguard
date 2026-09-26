"use client";
// OWNER: d1 (wave 3). The LIVE view's right rail (dashboard §2.4 "/ 03 — COUNTERS"): live
// counts, ticking cost and the degradations list — an ordinary panel (Surface + IndexStrip +
// ProvenanceStrip), never <Exhibit>: these are page furniture reading off two poll responses,
// not an artifact PRGuard is proving a claim about (plan §2 rule 1).
import { IndexStrip, ProvenanceLine, Surface } from "@/components/chrome";
import { Warn } from "@/components/icons";
import type { CostInfo, RunCounts } from "@/lib/api-types";
import { cacheHitShare, formatPercent, formatTokenCount, formatUsd, NO_VALUE } from "./format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="type-data text-[11px] text-text-dim">{label}</span>
      <span className="type-data tabular text-[13px] text-text-body">{value}</span>
    </div>
  );
}

export interface LiveRightRailProps {
  counts: RunCounts | null | undefined;
  cost: CostInfo | null | undefined;
  degradations: readonly string[];
  countsProvenance: string;
  costProvenance: string;
  className?: string;
}

export function LiveRightRail({ counts, cost, degradations, countsProvenance, costProvenance, className }: LiveRightRailProps) {
  const hit = cost ? cacheHitShare(cost.cache_read_tokens, cost.input_tokens) : null;
  return (
    <Surface elevation={2} variant="panel" className={className}>
      <IndexStrip index="03" category="COUNTERS" />
      <div className="flex flex-col divide-y divide-rule-hair px-3">
        <div className="py-2">
          <Row label="proposed" value={String(counts?.proposed ?? NO_VALUE)} />
          <Row label="published" value={String(counts?.published ?? NO_VALUE)} />
          <Row label="suppressed" value={String(counts?.suppressed ?? NO_VALUE)} />
          <Row label="blocking" value={String(counts?.blocking ?? NO_VALUE)} />
        </div>
        <div className="py-2">
          <Row label="usd_estimate" value={cost ? formatUsd(cost.usd_estimate) : NO_VALUE} />
          <Row label="input" value={cost ? formatTokenCount(cost.input_tokens) : NO_VALUE} />
          <Row label="output" value={cost ? formatTokenCount(cost.output_tokens) : NO_VALUE} />
          <Row
            label="cache read"
            value={cost ? `${formatTokenCount(cost.cache_read_tokens)}${hit != null ? ` (${formatPercent(hit)})` : ""}` : NO_VALUE}
          />
        </div>
        {degradations.length > 0 ? (
          <div className="py-2">
            <p className="type-data text-[11px] text-text-dim">degradations</p>
            <ul className="mt-1 flex flex-col gap-1">
              {degradations.map((d, i) => (
                <li key={`${d}-${i}`} className="flex items-center gap-1.5 type-data text-[11px] text-marker-text">
                  <Warn className="size-3 shrink-0" />
                  <span>{d.replaceAll("_", " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5 px-3 pb-3 pt-2">
        <ProvenanceLine source={countsProvenance} />
        <ProvenanceLine source={costProvenance} />
      </div>
    </Surface>
  );
}
