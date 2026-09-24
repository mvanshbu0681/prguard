"use client";
// OWNER: d4 (wave 3). /suppressions — the suppression ledger (dashboard-blueprint §2.8;
// plan A8). A list, not a fixed-row table: the reason is printed in full ("never
// truncated to meaninglessness"), so a row's height follows its own content instead of
// the dashboard's usual 32/26px table row (design §0.2's density applies to the
// metadata line, not the reason). Filters live in the URL (useSuppressionFilters,
// t2a) so the view is a shareable link, including the ?fingerprint= deep link a
// finding's detail page sends here.
//
// `SuppressionItem` (components.schemas, via @/lib/api-types) carries no fingerprint
// field — only the ledger's cross-reference (src/lib/fixture-query.ts, resolver-side)
// knows which fingerprints a row matches, so `?fingerprint=` still filters the server
// response correctly even though no column can print it per row (raised: props.ts's
// SuppressionItem should probably grow a fingerprint field so the deep link's target
// row is identifiable on screen, not just present in a filtered result).
import { useCompactRowsToggle, EmptyState, ErrorState, LoadingState, useListKeys } from "@/components/app-shell";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SUPPRESSION_SCOPES, type SuppressionScope } from "@/lib/contracts";
import { useSuppressionFilters, useSuppressions } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { LedgerStateChip } from "./LedgerStateChip";
import { RevokeDialog } from "./RevokeDialog";
import { formatRelativeDay, formatUtcDate, formatUtcStamp, ledgerState, matchLabel, shortSuppressionId } from "./format";

const ALL_SCOPE = "__all__";

function TotalsMeta({ active, expired, revoked }: { active: number; expired: number; revoked: number }) {
  return (
    <p className="type-data text-text-dim">
      {active.toLocaleString("en-US")} active · {expired.toLocaleString("en-US")} expired · {revoked.toLocaleString("en-US")} revoked
    </p>
  );
}

export function SuppressionsPage() {
  const [filters, setFilters] = useSuppressionFilters();
  const [compact] = useCompactRowsToggle();
  const query = useSuppressions({
    scope: filters.scope,
    repository: filters.repository,
    active: filters.active,
    fingerprint: filters.fingerprint,
    limit: 100,
  });

  const items = query.data?.items ?? [];
  const totals = query.data?.totals ?? { active: 0, expired: 0, revoked: 0 };
  const { gridProps, rowProps } = useListKeys({ count: items.length });

  const filtersActive = Boolean(filters.scope || filters.repository || filters.fingerprint || !filters.active);

  function clearFilters() {
    void setFilters({ scope: null, repository: null, active: true, fingerprint: null });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
      <p className="type-label text-text-dim">/suppressions</p>
      <h1 className="mt-2 type-display-h3 text-text-primary">Suppression ledger</h1>
      <p className="mt-2 max-w-(--measure-body) type-body text-text-body">
        Only proven findings can block a merge. Everything else is a comment. A suppression records why a finding was set aside; revoking one does not remove it from this record.
      </p>

      <Surface elevation={2} variant="panel" as="section" className="mt-6" aria-labelledby="suppressions-strip">
        <IndexStrip
          index="01"
          category="Suppression ledger"
          identifier={`${(totals.active + totals.expired + totals.revoked).toLocaleString("en-US")} entries in scope`}
          meta={<TotalsMeta active={totals.active ?? 0} expired={totals.expired ?? 0} revoked={totals.revoked ?? 0} />}
          labelId="suppressions-strip"
        />

        <div className="flex flex-wrap items-end gap-3 border-b border-rule-1 px-3 py-3">
          <label className="flex flex-col gap-1">
            <span className="type-label text-text-dim">State</span>
            <ToggleGroup
              type="single"
              value={filters.active ? "active" : "all"}
              onValueChange={(v) => v && void setFilters({ active: v === "active" })}
              aria-label="Ledger state filter"
            >
              <ToggleGroupItem value="active">ACTIVE ONLY</ToggleGroupItem>
              <ToggleGroupItem value="all">ALL ROWS</ToggleGroupItem>
            </ToggleGroup>
          </label>

          <label className="flex flex-col gap-1">
            <span className="type-label text-text-dim">Scope</span>
            <Select value={filters.scope ?? ALL_SCOPE} onValueChange={(v) => void setFilters({ scope: v === ALL_SCOPE ? null : (v as SuppressionScope) })}>
              <SelectTrigger className="w-40" aria-label="Scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SCOPE}>All scopes</SelectItem>
                {SUPPRESSION_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="type-label text-text-dim">Repository</span>
            <Input
              value={filters.repository ?? ""}
              onChange={(e) => void setFilters({ repository: e.target.value || null })}
              placeholder="owner/name"
              mono
              className="w-48"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="type-label text-text-dim">Fingerprint</span>
            <Input
              value={filters.fingerprint ?? ""}
              onChange={(e) => void setFilters({ fingerprint: e.target.value || null })}
              placeholder="a91f3c2e…"
              mono
              className="w-44"
            />
          </label>

          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="type-label text-text-dim underline decoration-dotted hover:text-text-body">
              CLEAR FILTERS
            </button>
          ) : null}
        </div>

        {query.isPending ? (
          <div className="px-3 py-2">
            <LoadingState rows={6} density={compact ? "compact" : "full"} label="Loading the suppression ledger." />
          </div>
        ) : query.isError ? (
          <div className="px-3 py-4">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-3">
            <EmptyState
              message={
                filtersActive
                  ? "No suppressions match this filter. Every finding PRGuard has raised outside it is still on the record."
                  : "No suppressions. Every finding PRGuard has raised is still on the record."
              }
              actions={filtersActive ? [{ label: "Clear filters", onClick: clearFilters }] : []}
            />
          </div>
        ) : (
          <ol {...gridProps} className="m-0 list-none p-0" aria-label="Suppression ledger rows">
            {items.map((item, i) => {
              const state = ledgerState(item, Date.now());
              return (
                <li
                  key={item.suppression_id}
                  {...rowProps(i)}
                  data-ledger-row={state}
                  className={cn(
                    "border-b border-rule-hair px-3 py-3 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal-hi",
                    state === "revoked" && "opacity-45",
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <LedgerStateChip state={state} />
                    <span className="type-data tabular text-text-dim" title={item.suppression_id}>
                      sup_{shortSuppressionId(item.suppression_id)}
                    </span>
                    <time dateTime={item.created_at} className="type-data tabular text-text-dim">
                      {formatUtcStamp(item.created_at)}
                    </time>
                    <span className="type-data text-text-body">{item.created_by ?? "system"}</span>
                    <Badge variant="outline">scope={item.scope}</Badge>
                    {item.category ? <Badge variant="outline">{item.category}</Badge> : null}
                  </div>

                  <p className={cn("mt-1.5 max-w-(--measure-body) type-body text-text-body", state === "revoked" && "line-through decoration-1")}>
                    &ldquo;{item.reason}&rdquo;
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 type-data text-text-dim">
                    <span className="min-w-0 truncate" title={matchLabel(item)}>
                      matches {matchLabel(item)}
                    </span>
                    <span>{item.expires_at ? `expires ${formatUtcDate(item.expires_at)}` : "no expiry"}</span>
                    <span>suppressed {(item.suppressed_count ?? 0).toLocaleString("en-US")} findings</span>
                    <span>{item.last_matched_at ? `last matched ${formatRelativeDay(item.last_matched_at)}` : "never matched"}</span>
                    <span>{item.source === "auto_convention" ? "auto convention" : "human via API"}</span>
                    <span className="ml-auto flex items-center gap-3">
                      {state === "active" ? (
                        <RevokeDialog suppression={item} />
                      ) : state === "revoked" && item.revoked_at ? (
                        <span className="type-label text-text-dim">revoked {formatUtcDate(item.revoked_at)}</span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <ProvenanceStrip source="GET /v1/suppressions" />
      </Surface>
    </div>
  );
}
