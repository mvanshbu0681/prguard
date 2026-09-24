"use client";
// OWNER: d2 (wave 3). /findings' filter bar — every §6.5 filter, URL-first
// (dashboard §2.6, brief: "a judge dropped into
// /findings?severity_min=high&proof_status=proven&blocking=true must see
// exactly the findings that matter"). Presentational: it takes `filters` and
// `setFilters` as props rather than calling useFindingFilters() itself, so it
// is testable without mounting the nuqs adapter or a router (see
// tests/unit/routes/findings-list/filter-bar.test.tsx).
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Cross } from "@/components/icons";
import { FINDING_STATUSES, PROOF_STATUSES, SEVERITY_BANDS, type FindingStatus, type ProofStatus, type SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { activeFilterChips, shortFingerprint } from "./format";
import type { FindingUrlFilters, SetFindingUrlFilters } from "./types";

export interface FilterBarProps {
  filters: FindingUrlFilters;
  setFilters: SetFindingUrlFilters;
  /** totals.matched under the current filters. undefined while the first page is still loading. */
  matched?: number;
  /** The corpus total with no filters applied. undefined while loading. */
  total?: number;
  className?: string;
}

const BLOCKING_VALUE = { any: "any", blocking: "true", clear: "false" } as const;
const STATUS_ANY = "__any__";

/** A small labeled control: 11px mono-caps label above, the control below — the dashboard's instrument-panel-legend register (design §0.2). */
function FilterField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-label text-text-dim" id={htmlFor ? `${htmlFor}-label` : undefined}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** A free-text filter (repository, PR #, run id, fingerprint): local state so every keystroke doesn't replace the URL — committed on blur or Enter. */
function TextFilter({
  label,
  value,
  placeholder,
  mono = true,
  inputMode,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  mono?: boolean;
  inputMode?: "text" | "numeric";
  onCommit: (next: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function commit() {
    if (draft !== value) onCommit(draft);
  }
  return (
    <FilterField label={label} htmlFor={id}>
      <Input
        id={id}
        mono={mono}
        inputMode={inputMode}
        value={draft}
        placeholder={placeholder}
        className="h-8 w-32"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape" && draft !== value) {
            e.preventDefault();
            setDraft(value);
          }
        }}
      />
    </FilterField>
  );
}

export function FilterBar({ filters, setFilters, matched, total, className }: FilterBarProps) {
  const chips = activeFilterChips(filters);

  return (
    <div className={cn("flex flex-col gap-3 border-b border-rule-1 bg-ink-1 px-4 py-3", className)} data-slot="findings-filter-bar">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <FilterField label="severity ≥">
          <ToggleGroup
            type="single"
            size="sm"
            value={filters.severity_min ?? ""}
            onValueChange={(v) => setFilters({ severity_min: (v || null) as SeverityBand | null })}
            aria-label="Minimum severity"
          >
            {SEVERITY_BANDS.map((band) => (
              <ToggleGroupItem key={band} value={band} className="type-label px-2">
                {band}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FilterField>

        <FilterField label="proof">
          <ToggleGroup
            type="multiple"
            size="sm"
            value={[...(filters.proof_status ?? [])]}
            onValueChange={(v) => setFilters({ proof_status: v.length ? (v as ProofStatus[]) : null })}
            aria-label="Proof status"
          >
            {PROOF_STATUSES.map((status) => (
              <ToggleGroupItem key={status} value={status} className="type-label px-2">
                {status.replaceAll("_", " ")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FilterField>

        <FilterField label="blocking">
          <ToggleGroup
            type="single"
            size="sm"
            value={filters.blocking === null || filters.blocking === undefined ? BLOCKING_VALUE.any : filters.blocking ? BLOCKING_VALUE.blocking : BLOCKING_VALUE.clear}
            onValueChange={(v) => {
              if (!v || v === BLOCKING_VALUE.any) setFilters({ blocking: null });
              else setFilters({ blocking: v === BLOCKING_VALUE.blocking });
            }}
            aria-label="Blocking"
          >
            <ToggleGroupItem value={BLOCKING_VALUE.any} className="type-label px-2">
              any
            </ToggleGroupItem>
            <ToggleGroupItem value={BLOCKING_VALUE.blocking} className="type-label px-2">
              blocking
            </ToggleGroupItem>
            <ToggleGroupItem value={BLOCKING_VALUE.clear} className="type-label px-2">
              non-blocking
            </ToggleGroupItem>
          </ToggleGroup>
        </FilterField>

        <FilterField label="status">
          <Select value={filters.status ?? STATUS_ANY} onValueChange={(v) => setFilters({ status: v === STATUS_ANY ? null : (v as FindingStatus) })}>
            <SelectTrigger size="sm" className="h-8 w-36" aria-label="Finding status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ANY}>any</SelectItem>
              {FINDING_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <TextFilter label="repository" value={filters.repository ?? ""} placeholder="owner/name" onCommit={(v) => setFilters({ repository: v.trim() || null })} />
        <TextFilter
          label="PR #"
          value={filters.pr_number != null ? String(filters.pr_number) : ""}
          placeholder="42"
          inputMode="numeric"
          onCommit={(v) => {
            const n = Number.parseInt(v, 10);
            setFilters({ pr_number: v.trim() && Number.isFinite(n) ? n : null });
          }}
        />
        <TextFilter label="run id" value={filters.review_id ?? ""} placeholder="4e8b1d0c…" onCommit={(v) => setFilters({ review_id: v.trim() || null })} />
        <TextFilter label="fingerprint" value={filters.fingerprint ?? ""} placeholder="a91f3c2e…" onCommit={(v) => setFilters({ fingerprint: v.trim() || null })} />

        <div className="ml-auto flex items-center gap-3 self-center pt-4">
          <span className="type-data tabular text-text-body" data-slot="findings-totals">
            {matched === undefined || total === undefined ? "…" : `${matched.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          {chips.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(null)}>
              CLEAR FILTERS
            </Button>
          ) : null}
        </div>
      </div>

      {chips.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Badge asChild variant="outline">
                <button type="button" onClick={() => setFilters(chip.clear)} aria-label={`Clear filter: ${chip.text}`}>
                  {chip.text}
                  <Cross className="ml-1.5 -mr-0.5 text-[0.7em]" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Re-exported so tests can assert the fingerprint chip text without duplicating the truncation rule.
export { shortFingerprint };
