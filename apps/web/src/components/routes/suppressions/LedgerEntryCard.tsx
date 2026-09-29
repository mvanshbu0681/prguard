// One suppression on the ledger: what it covers (reach meter + exact target),
// what it silenced (the finding's title, linked), why (the reason, quoted, in
// full — never truncated to meaninglessness), who and when (with a link to the
// exact seq on the audit chain), and its state with an expiry countdown. Active
// rows carry the Revoke action; expired and revoked rows are visibly quieter but
// stay on the record.
import Link from "next/link";
import { Link2, Siren } from "lucide-react";
import { Avatar, Tag } from "@/components/dash/kit";
import { relTime } from "@/components/dash/format";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, EXPIRING_SOON_DAYS, compactDays, formatUtcDate, formatUtcStamp } from "./format";
import type { LedgerEntry } from "./ledger-model";
import { LedgerStateChip } from "./LedgerStateChip";
import { RevokeDialog } from "./RevokeDialog";
import { RichText } from "./RichText";
import { ScopeTarget } from "./ScopeTarget";
import s from "./suppressions.module.css";

function Expiry({ entry, nowMs }: { entry: LedgerEntry; nowMs: number }) {
  const { item, state, expiresInDays, revoked } = entry;
  if (state === "revoked") {
    const at = item.revoked_at ?? revoked?.at ?? null;
    return (
      <p className={s.sideNote} title={at ? formatUtcStamp(at) : undefined}>
        Revoked {at ? relTime(at, nowMs) : ""}
        {revoked?.actor ? <> by {revoked.actor}</> : null}
      </p>
    );
  }
  if (state === "expired") {
    return (
      <p className={s.sideNote} title={item.expires_at ? formatUtcStamp(item.expires_at) : undefined}>
        {item.expires_at ? <>Expired {formatUtcDate(item.expires_at)}</> : "Expired"}
      </p>
    );
  }
  if (expiresInDays === null) {
    return (
      <p className={s.sideNote} title="Open-ended: stays until someone revokes it">
        No expiry
      </p>
    );
  }
  const soon = expiresInDays <= EXPIRING_SOON_DAYS;
  return (
    <Tag tone={soon ? "warn" : "outline"} size="sm" title={item.expires_at ? `Expires ${formatUtcStamp(item.expires_at)}` : undefined}>
      {expiresInDays <= 0 ? "Expires today" : `Expires in ${compactDays(expiresInDays)}`}
    </Tag>
  );
}

export interface LedgerEntryCardProps {
  entry: LedgerEntry;
  nowMs: number;
  /** False when the list is already filtered to this row's state — the tag would only repeat the tab. */
  showState?: boolean;
}

export function LedgerEntryCard({ entry, nowMs, showState = true }: LedgerEntryCardProps) {
  const { item, state, finding, repository, created, breakGlass } = entry;
  const author = item.created_by ?? "system";
  const silenced = item.suppressed_count ?? 0;
  const quiet = state !== "active";

  return (
    <li className={cn(s.entry, quiet && s.entryQuiet)} data-ledger-row={state} data-state={state}>
      <div className={s.entryMain}>
        <div className={s.entryTop}>
          <ScopeTarget item={item} fingerprint={finding?.fingerprint ?? null} />
          {item.category ? (
            <span className={cn(s.category, item.category === "security" && s.categorySecurity)}>{CATEGORY_LABEL[item.category] ?? item.category}</span>
          ) : null}
          {breakGlass ? (
            <Link href={`/audit?seq=${breakGlass.seq}`} className={s.breakGlass} title={`Recorded with a break-glass override at seq ${breakGlass.seq}`}>
              <Siren size={12} strokeWidth={2} aria-hidden />
              Break-glass
            </Link>
          ) : null}
        </div>

        {finding ? (
          <h3 className={s.entryTitle}>
            <Link href={`/findings/${finding.id}`} className={s.entryTitleLink}>
              <RichText text={finding.title} />
            </Link>
            {repository ? <span className={s.entryRepo}>{repository}</span> : null}
          </h3>
        ) : null}

        <blockquote className={cn(s.reason, state === "revoked" && s.reasonStruck)}>{item.reason}</blockquote>

        <div className={s.entryMeta}>
          <span className={s.metaWho}>
            <Avatar name={author} size={22} />
            <span className={s.metaStrong}>{author}</span>
            <span title={formatUtcStamp(item.created_at)}>{relTime(item.created_at, nowMs)}</span>
          </span>
          <span className={s.metaDot} aria-hidden />
          <span>
            silenced <b className={s.metaNum}>{silenced.toLocaleString("en-US")}</b> {silenced === 1 ? "finding" : "findings"}
            {item.last_matched_at ? <> · last {relTime(item.last_matched_at, nowMs)}</> : null}
          </span>
          {created ? (
            <>
              <span className={s.metaDot} aria-hidden />
              <Link href={`/audit?seq=${created.seq}`} className={s.chainLink} title={`suppression.created at seq ${created.seq} on the audit chain`}>
                <Link2 size={12} strokeWidth={2} aria-hidden />#{created.seq.toLocaleString("en-US")}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className={s.entrySide}>
        {showState ? <LedgerStateChip state={state} /> : null}
        <Expiry entry={entry} nowMs={nowMs} />
        {state === "active" ? <RevokeDialog suppression={item} finding={finding} /> : null}
      </div>
    </li>
  );
}
