// Why this finding is not (or no longer) on the pull request: suppressed with
// a reason on the ledger, dropped by the coordinator, or still proposed. A
// refuted finding needs no notice: the proof card is the explanation.
import Link from "next/link";
import { ArrowUpRight, EyeOff, FunnelX, Hourglass } from "lucide-react";
import { Avatar, Card } from "@/components/dash/kit";
import { CORPUS_NOW, shortDate } from "@/components/dash/format";
import { FIXTURES } from "@/lib/env";
import { useSuppressions } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { ledgerHref, suppressionState } from "./format";
import s from "./detail.module.css";

/** "Now" for expiry: the corpus's frozen instant in fixture mode, so an expiry never drifts with the wall clock. */
const NOW_MS = FIXTURES ? CORPUS_NOW : Date.now();

/** The ledger row behind a finding's suppression: the finding carries only its id, reason and expiry, not whether it was revoked. */
function useLedgerRow(suppressionId: string | undefined) {
  const ledger = useSuppressions({ active: false, limit: 100 }, { enabled: Boolean(suppressionId) });
  return ledger.data?.items?.find((row) => row.suppression_id === suppressionId);
}

function SuppressionNotice({ finding }: { finding: Finding }) {
  const sup = finding.suppression;
  const row = useLedgerRow(sup?.suppression_id);
  const state = suppressionState({ revoked_at: row?.revoked_at, expires_at: row?.expires_at ?? sup?.expires_at, active: row?.active }, NOW_MS);
  const ledger = ledgerHref(finding.fingerprint, state);
  const when =
    state === "revoked" && row?.revoked_at
      ? `Revoked ${shortDate(row.revoked_at)}: it no longer silences this finding`
      : state === "expired"
        ? `Expired ${shortDate(row?.expires_at ?? sup?.expires_at)}`
        : sup?.expires_at
          ? `Expires ${shortDate(sup.expires_at)}`
          : "Never expires";
  return (
    <Card as="section" tone="panel" pad="lg" className={s.cardBody} aria-label="Suppression">
      <div className={s.notice}>
        <span className={s.noticeIcon} aria-hidden>
          <EyeOff size={18} strokeWidth={1.9} />
        </span>
        <div className={s.noticeText}>
          <p className={s.noticeTitle}>
            Suppressed{sup ? `, ${sup.scope} scope` : ""}
            {state !== "active" ? <span className={s.noticeState}>{state === "revoked" ? " · revoked" : " · expired"}</span> : null}
          </p>
          {sup ? <p className={s.quote}>&ldquo;{sup.reason}&rdquo;</p> : null}
          <div className={s.noticeMeta}>
            {sup?.created_by ? (
              <span className="inline-flex items-center gap-2">
                <Avatar name={sup.created_by} size={22} />
                {sup.created_by}
              </span>
            ) : null}
            <span>{when}</span>
            <Link href={ledger} className={s.inlineLink}>
              On the ledger <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function StateNotice({ finding }: { finding: Finding }) {
  if (finding.status === "suppressed") return <SuppressionNotice finding={finding} />;
  if (finding.status === "dropped") {
    return (
      <Card as="section" tone="panel" pad="lg" className={s.cardBody} aria-label="Dropped">
        <div className={s.notice}>
          <span className={s.noticeIcon} aria-hidden>
            <FunnelX size={18} strokeWidth={1.9} />
          </span>
          <div className={s.noticeText}>
            <p className={s.noticeTitle}>Dropped by the coordinator</p>
            <p className={s.quote}>A specialist raised it; the coordinator kept it off the pull request as speculation, a nitpick or a duplicate. It is kept here so the decision can be checked.</p>
          </div>
        </div>
      </Card>
    );
  }
  if (finding.status === "proposed") {
    return (
      <Card as="section" tone="panel" pad="lg" className={s.cardBody} aria-label="Proposed">
        <div className={s.notice}>
          <span className={s.noticeIcon} aria-hidden>
            <Hourglass size={18} strokeWidth={1.9} />
          </span>
          <div className={s.noticeText}>
            <p className={s.noticeTitle}>Still proposed</p>
            <p className={s.quote}>The coordinator has not ruled on it yet, so it has not been posted.</p>
          </div>
        </div>
      </Card>
    );
  }
  return null;
}
