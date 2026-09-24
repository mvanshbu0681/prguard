"use client";
// OWNER: d3 (wave 3). §06 — IDENTITY (dashboard-blueprint §2.7 §06): the
// fingerprint (full, copyable), the history counters, the other occurrences
// sharing this fingerprint (GET /v1/findings?fingerprint=), and the
// suppression status for this fingerprint.
//
// "the hash stays still while the code moves" — the fingerprint is pinned at
// the top of the panel; the occurrence rows scroll beneath it inside their own
// max-height region, never the reverse.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/app-shell";
import { useFindings, suppressionsHref } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { CopyableValue } from "./CopyableValue";
import { formatRelativeAge, locationRangeLabel } from "./format";
import { OrdinaryPanel } from "./OrdinaryPanel";

const META_LABEL = "type-label text-text-dim";
const META_VALUE = "type-data text-text-body";

function HistoryCounters({ finding }: { finding: Finding }) {
  const history = finding.history;
  if (!history) return <p className="type-small text-text-dim">No occurrence history recorded.</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <div className="flex flex-col gap-0.5">
        <span className={META_LABEL}>Occurrences</span>
        <span className={META_VALUE}>{history.occurrence_count ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={META_LABEL}>First seen</span>
        <span className={META_VALUE}>
          {history.first_seen_run_id ? (
            <Link className="link-draw" href={`/runs/${history.first_seen_run_id}`}>
              run {history.first_seen_run_id.slice(0, 7)}
            </Link>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={META_LABEL}>Previously addressed</span>
        <span className={META_VALUE}>{history.previously_addressed ?? 0}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={META_LABEL}>Previously dismissed</span>
        <span className={META_VALUE}>{history.previously_dismissed ?? 0}</span>
      </div>
    </dl>
  );
}

function SuppressionStatus({ finding, onSuppress }: { finding: Finding; onSuppress: () => void }) {
  const suppression = finding.suppression;
  if (!suppression) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-hair pt-4">
        <p className="type-small text-text-dim">No suppression for this fingerprint.</p>
        <Button variant="ghost" size="sm" onClick={onSuppress}>
          SUPPRESS
        </Button>
      </div>
    );
  }
  const href = finding.fingerprint ? suppressionsHref("/suppressions", { fingerprint: finding.fingerprint }) : "/suppressions";
  return (
    <div className="flex flex-col gap-3 border-t border-rule-hair pt-4">
      <p className="type-label text-text-dim">Suppression</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className={META_LABEL}>Scope</span>
          <span className={META_VALUE}>{suppression.scope}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={META_LABEL}>By</span>
          <span className={META_VALUE}>{suppression.created_by ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={META_LABEL}>Expires</span>
          <span className={META_VALUE}>{suppression.expires_at ?? "never"}</span>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-1">
          <Link className="link-draw" href={href}>
            View in ledger →
          </Link>
        </div>
      </dl>
      <p className="type-body text-text-body">{suppression.reason}</p>
    </div>
  );
}

function OtherOccurrences({ finding }: { finding: Finding }) {
  const enabled = Boolean(finding.fingerprint);
  const query = useFindings({ fingerprint: finding.fingerprint ?? undefined }, { enabled });
  if (!enabled) return <p className="type-small text-text-dim">No fingerprint recorded — occurrence history is unavailable.</p>;
  if (query.isPending) return <LoadingState rows={3} label="Loading occurrences." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const others = (query.data.items ?? []).filter((f) => f.id !== finding.id);
  if (others.length === 0) return <p className="type-small text-text-dim">No other occurrence of this fingerprint in the corpus.</p>;
  return (
    <ul className="flex flex-col divide-y divide-rule-hair">
      {others.map((occurrence) => (
        <li key={occurrence.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <Link className="link-draw type-data" href={`/findings/${occurrence.id}`}>
            {locationRangeLabel(occurrence.location.file_path, occurrence.location.start_line)}
          </Link>
          <span className="type-small text-text-dim">{formatRelativeAge(occurrence.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function IdentitySection({ finding, onSuppress }: { finding: Finding; onSuppress: () => void }) {
  return (
    <OrdinaryPanel index="06" category="Identity" provenance={`GET /v1/findings/${finding.id.slice(0, 8)} → fingerprint · history`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className={META_LABEL}>Fingerprint</span>
          {finding.fingerprint ? (
            <CopyableValue label="fingerprint" display={finding.fingerprint} full={finding.fingerprint} className="w-fit break-all" />
          ) : (
            <span className={META_VALUE}>not fingerprinted</span>
          )}
        </div>
        <HistoryCounters finding={finding} />
        <div className="border-t border-rule-hair pt-4">
          <p className="mb-2 type-label text-text-dim">Other occurrences</p>
          <OtherOccurrences finding={finding} />
        </div>
        <SuppressionStatus finding={finding} onSuppress={onSuppress} />
      </div>
    </OrdinaryPanel>
  );
}
