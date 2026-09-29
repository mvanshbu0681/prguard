"use client";
// The inbox's controls, all pills: the status segments with live counts, a
// search field, one dropdown pill per filter (the pill turns ink and carries
// its value when set, with its own ×), a Blocking toggle, grouping and sort.
// Deep-link identity filters (a run, a PR number, a fingerprint) that have no
// control of their own show as removable dashed chips.
//
// Presentational: `view` / `setView` are props, so it is testable with a spy
// setter and no nuqs adapter (tests/unit/routes/findings-list/filter-bar.test.tsx).
import { DropdownMenu } from "radix-ui";
import { ArrowUpDown, Check, ChevronDown, Search, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, Kbd, Segmented, TextField, bandColor, type SegmentedOption } from "@/components/dash/kit";
import { humanize } from "@/components/dash/format";
import { PROOF_STATUSES, type ProofStatus, type SeverityBand } from "@/lib/contracts";
import { useKeyBinding } from "@/motion/keys";
import { cn } from "@/lib/utils";
import { PROOF_LABEL, SEVERITY_FLOOR_LABEL, SORT_LABEL, STATUS_LABEL, activeFilterChips, clearFiltersPatch, type RepoLookupEntry } from "./format";
import { SORTS, SPECIALISTS, type FindingsGroup, type FindingsSort, type FindingsView, type SetFindingsView, type Specialist, type StatusView } from "./types";
import s from "./findings.module.css";

export interface FilterBarProps {
  view: FindingsView;
  setView: SetFindingsView;
  /** Count per status segment under the other filters; undefined while loading. */
  statusCounts?: Partial<Record<StatusView, number | undefined>>;
  /** `owner/name` options for the Repository pill. */
  repositories?: string[];
  /** The review join, for the Pull request pill's options. */
  lookup?: Map<string, RepoLookupEntry>;
  className?: string;
}

const SEVERITY_DESC: readonly SeverityBand[] = ["critical", "high", "medium", "low", "info"];
const STATUS_SEGMENTS: readonly StatusView[] = ["published", "disproven", "suppressed", "dropped", "all"];
const SEARCH_COMMIT_MS = 280;

/* ------------------------------------------------------------------ pill */

function FilterPill({
  label,
  value,
  onClear,
  clearLabel,
  children,
  align = "start",
}: {
  label: string;
  /** The chosen value's display; null = unset (outline pill). */
  value: ReactNode | null;
  onClear?: () => void;
  clearLabel?: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const active = value !== null;
  return (
    <DropdownMenu.Root modal={false}>
      <span className={s.pillWrap} data-active={active ? "" : undefined}>
        <DropdownMenu.Trigger className={s.pill}>
          {label}
          {active ? <span className={s.pillValue}>{value}</span> : null}
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </DropdownMenu.Trigger>
        {active && onClear ? (
          <button type="button" className={s.pillClear} onClick={onClear} aria-label={clearLabel ?? `Clear ${label.toLowerCase()} filter`}>
            <X size={13} strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
      </span>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={s.menu} align={align} sideOffset={8} collisionPadding={16}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RadioOption({ value, children, swatch }: { value: string; children: ReactNode; swatch?: string }) {
  return (
    <DropdownMenu.RadioItem value={value} className={s.option}>
      {swatch ? <span className={s.swatch} style={{ background: swatch }} aria-hidden /> : null}
      {children}
      <DropdownMenu.ItemIndicator className={s.optionCheck}>
        <Check size={15} strokeWidth={2.2} aria-hidden />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

/* ------------------------------------------------------------------ search */

function SearchField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  // Reset the draft when the URL value changes from outside (a chip's ×, Clear all).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  // Commit a pause in typing to the URL, not every keystroke.
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onCommit(draft), SEARCH_COMMIT_MS);
    return () => clearTimeout(t);
  }, [draft, value, onCommit]);
  useKeyBinding("/", () => inputRef.current?.focus());

  return (
    <TextField
      ref={inputRef}
      wrapperClassName={s.search}
      icon={Search}
      size="sm"
      type="search"
      aria-label="Search findings"
      placeholder="Search titles, files, rules"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft("");
          onCommit("");
          e.currentTarget.blur();
        }
      }}
      trailing={
        draft ? (
          <IconButton
            icon={X}
            size="sm"
            label="Clear search"
            onClick={() => {
              setDraft("");
              onCommit("");
            }}
          />
        ) : (
          <Kbd className="mr-2">/</Kbd>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ bar */

export function FilterBar({ view, setView, statusCounts = {}, repositories = [], lookup, className }: FilterBarProps) {
  const chips = activeFilterChips(view);
  const chipOnly = chips.filter((c) => c.shownOn === "chip");

  const segments: SegmentedOption<StatusView>[] = (view.status === "proposed" ? [...STATUS_SEGMENTS.slice(0, 4), "proposed", "all"] : STATUS_SEGMENTS).map((v) => ({
    value: v as StatusView,
    label: STATUS_LABEL[v as StatusView],
    count: statusCounts[v as StatusView],
  }));

  const prOptions = view.repository && lookup ? prsOf(lookup, view.repository) : [];

  return (
    <div className={cn(s.toolbar, className)} data-slot="findings-filter-bar">
      <div className={s.toolRow}>
        <div className={s.segScroll}>
          <Segmented label="Finding status" options={segments} value={view.status} onChange={(status) => setView({ status: status === "published" ? null : status })} />
        </div>
        <SearchField value={view.q ?? ""} onCommit={(q) => setView({ q: q.trim() ? q : null })} />
      </div>

      <div className={s.toolRow}>
        <div className={s.pills} role="group" aria-label="Filters">
          <FilterPill label="Severity" value={view.severity_min ? `≥ ${humanize(view.severity_min)}` : null} onClear={() => setView({ severity_min: null })}>
            <p className={s.menuLabel}>Computed severity</p>
            <DropdownMenu.RadioGroup value={view.severity_min ?? "any"} onValueChange={(v) => setView({ severity_min: v === "any" ? null : (v as SeverityBand) })}>
              <RadioOption value="any">Any severity</RadioOption>
              {SEVERITY_DESC.map((band) => (
                <RadioOption key={band} value={band} swatch={bandColor(band)}>
                  {SEVERITY_FLOOR_LABEL[band]}
                </RadioOption>
              ))}
            </DropdownMenu.RadioGroup>
          </FilterPill>

          <FilterPill
            label="Proof"
            value={view.proof_status.length === 0 ? null : view.proof_status.length === 1 ? PROOF_LABEL[view.proof_status[0]] : `${view.proof_status.length} states`}
            onClear={() => setView({ proof_status: null })}
          >
            <p className={s.menuLabel}>Proof by execution</p>
            {PROOF_STATUSES.map((status) => {
              const checked = view.proof_status.includes(status);
              return (
                <DropdownMenu.CheckboxItem
                  key={status}
                  className={s.option}
                  checked={checked}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(next) => {
                    const set = new Set<ProofStatus>(view.proof_status);
                    if (next) set.add(status);
                    else set.delete(status);
                    const list = PROOF_STATUSES.filter((p) => set.has(p));
                    setView({ proof_status: list.length ? list : null });
                  }}
                >
                  <span className={s.optionBox} aria-hidden>
                    {checked ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                  {PROOF_LABEL[status]}
                </DropdownMenu.CheckboxItem>
              );
            })}
          </FilterPill>

          <FilterPill label="Specialist" value={view.specialist ? humanize(view.specialist) : null} onClear={() => setView({ specialist: null })}>
            <p className={s.menuLabel}>Raised by</p>
            <DropdownMenu.RadioGroup value={view.specialist ?? "any"} onValueChange={(v) => setView({ specialist: v === "any" ? null : (v as Specialist) })}>
              <RadioOption value="any">Any specialist</RadioOption>
              {SPECIALISTS.map((sp) => (
                <RadioOption key={sp} value={sp}>
                  {humanize(sp)}
                </RadioOption>
              ))}
            </DropdownMenu.RadioGroup>
          </FilterPill>

          <FilterPill
            label="Repository"
            value={view.repository ? view.repository.split("/").pop() : null}
            onClear={() => setView({ repository: null, pr_number: null })}
          >
            <p className={s.menuLabel}>Repository</p>
            <DropdownMenu.RadioGroup value={view.repository ?? "any"} onValueChange={(v) => setView({ repository: v === "any" ? null : v, pr_number: null })}>
              <RadioOption value="any">Every repository</RadioOption>
              {repositories.map((repo) => (
                <RadioOption key={repo} value={repo}>
                  {repo}
                </RadioOption>
              ))}
            </DropdownMenu.RadioGroup>
          </FilterPill>

          {view.repository && prOptions.length > 0 ? (
            <FilterPill label="Pull request" value={view.pr_number !== null ? `#${view.pr_number}` : null} onClear={() => setView({ pr_number: null })}>
              <p className={s.menuLabel}>{view.repository.split("/").pop()}</p>
              <DropdownMenu.RadioGroup value={view.pr_number !== null ? String(view.pr_number) : "any"} onValueChange={(v) => setView({ pr_number: v === "any" ? null : Number(v) })}>
                <RadioOption value="any">Every pull request</RadioOption>
                {prOptions.map((pr) => (
                  <RadioOption key={pr.number} value={String(pr.number)}>
                    <span className="min-w-0 truncate">
                      <span className="font-w-mono text-[12.5px]">#{pr.number}</span> {pr.title ?? ""}
                    </span>
                  </RadioOption>
                ))}
              </DropdownMenu.RadioGroup>
            </FilterPill>
          ) : null}

          <button
            type="button"
            className={cn(s.pill, s.toggle)}
            aria-pressed={view.blocking === true}
            onClick={() => setView({ blocking: view.blocking === true ? null : true })}
          >
            <Square size={11} strokeWidth={2.4} aria-hidden />
            Blocking only
          </button>
        </div>

        <div className={s.viewControls}>
          <Segmented<FindingsGroup>
            size="sm"
            label="Group findings"
            value={view.group}
            onChange={(group) => setView({ group: group === "none" ? null : group })}
            options={[
              { value: "none", label: "List" },
              { value: "pr", label: "By PR" },
              { value: "file", label: "By file" },
            ]}
          />
          <FilterPill label="Sort" value={view.sort === "newest" ? null : SORT_LABEL[view.sort]} onClear={() => setView({ sort: null })} clearLabel="Reset sort" align="end">
            <p className={s.menuLabel}>Order</p>
            <DropdownMenu.RadioGroup value={view.sort} onValueChange={(v) => setView({ sort: v === "newest" ? null : (v as FindingsSort) })}>
              {SORTS.map((sort) => (
                <RadioOption key={sort} value={sort}>
                  <ArrowUpDown size={14} strokeWidth={1.9} aria-hidden className="text-w-subtle" />
                  {SORT_LABEL[sort]}
                </RadioOption>
              ))}
            </DropdownMenu.RadioGroup>
          </FilterPill>
        </div>
      </div>

      {chips.length > 0 ? (
        <ul className={s.chips} aria-label="Active filters">
          {chipOnly.map((chip) => (
            <li key={chip.key}>
              <button type="button" className={s.chip} onClick={() => setView(chip.clear)} aria-label={`Clear filter: ${chip.text}`}>
                {chip.text}
                <X size={12} strokeWidth={2.2} aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={s.chip} onClick={() => setView(clearFiltersPatch())}>
              Clear all filters
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** The PRs of one repository in the review join, newest number first. */
function prsOf(lookup: Map<string, RepoLookupEntry>, repository: string): { number: number; title: string | null }[] {
  const byNumber = new Map<number, string | null>();
  for (const entry of lookup.values()) {
    if (entry.repository === repository && !byNumber.has(entry.prNumber)) byNumber.set(entry.prNumber, entry.prTitle);
  }
  return [...byNumber.entries()].sort((a, b) => b[0] - a[0]).map(([number, title]) => ({ number, title }));
}
