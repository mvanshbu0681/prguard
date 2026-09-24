"use client";
// OWNER: d1 (wave 3). RESULT's "Cost & timing" sub-tab (dashboard §2.5): cost (usd to 4
// decimals, tokens thin-space grouped, cache read share), timing, the reviewed/excluded file
// context and the run's degradations — an ordinary panel, no registration marks.
import { IndexStrip, ProvenanceLine, Surface } from "@/components/chrome";
import { Warn } from "@/components/icons";
import type { ContextInfo, CostInfo, TimingInfo } from "@/lib/api-types";
import { cacheHitShare, formatDurationSeconds, formatIsoSeconds, formatPercent, formatTokenCount, formatUsd, NO_VALUE } from "./format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="type-data text-[11px] text-text-dim">{label}</span>
      <span className="type-data tabular text-[13px] text-text-body">{value}</span>
    </div>
  );
}

export interface CostTimingPanelProps {
  cost: CostInfo | null | undefined;
  timing: TimingInfo | null | undefined;
  context: ContextInfo | null | undefined;
  degradations: readonly string[];
  provenance: string;
  className?: string;
}

export function CostTimingPanel({ cost, timing, context, degradations, provenance, className }: CostTimingPanelProps) {
  const hit = cost ? cacheHitShare(cost.cache_read_tokens, cost.input_tokens) : null;
  const excludedReasons = context?.excluded_reasons ?? {};
  const excludedEntries = Object.entries(excludedReasons);

  return (
    <Surface elevation={2} variant="panel" className={className}>
      <IndexStrip index="06" category="COST & TIMING" />
      <div className="grid grid-cols-1 gap-6 px-4 py-4 md:grid-cols-3">
        <section>
          <p className="type-label text-text-dim">COST</p>
          <div className="mt-2">
            <Row label="usd_estimate" value={cost ? formatUsd(cost.usd_estimate) : NO_VALUE} />
            <Row label="input tokens" value={cost ? formatTokenCount(cost.input_tokens) : NO_VALUE} />
            <Row label="output tokens" value={cost ? formatTokenCount(cost.output_tokens) : NO_VALUE} />
            <Row
              label="cache read"
              value={cost ? `${formatTokenCount(cost.cache_read_tokens)}${hit != null ? ` (${formatPercent(hit)})` : ""}` : NO_VALUE}
            />
          </div>
        </section>
        <section>
          <p className="type-label text-text-dim">TIMING</p>
          <div className="mt-2">
            <Row label="queued" value={formatIsoSeconds(timing?.queued_at)} />
            <Row label="started" value={formatIsoSeconds(timing?.started_at)} />
            <Row label="finished" value={formatIsoSeconds(timing?.finished_at)} />
            <Row label="wall clock" value={formatDurationSeconds(timing?.duration_seconds)} />
          </div>
        </section>
        <section>
          <p className="type-label text-text-dim">CONTEXT</p>
          <div className="mt-2">
            <Row label="files changed" value={String(context?.files_changed ?? NO_VALUE)} />
            <Row label="files reviewed" value={String(context?.files_reviewed ?? NO_VALUE)} />
            <Row label="files excluded" value={String(context?.files_excluded ?? NO_VALUE)} />
            {context?.truncated ? (
              <p className="mt-1 flex items-center gap-1.5 type-data text-[11px] text-marker-text">
                <Warn className="size-3 shrink-0" /> context truncated
              </p>
            ) : null}
            {excludedEntries.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5">
                {excludedEntries.map(([path, reason]) => (
                  <li key={path} className="truncate type-data text-[11px] text-text-dim" title={`${path} — ${reason}`}>
                    {path} <span className="text-text-disabled">— {reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
      {degradations.length > 0 ? (
        <div className="border-t border-rule-hair px-4 py-3">
          <p className="type-label text-text-dim">DEGRADATIONS</p>
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
      <div className="px-4 pb-3 pt-2">
        <ProvenanceLine source={provenance} />
      </div>
    </Surface>
  );
}
