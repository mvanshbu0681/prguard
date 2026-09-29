"use client";
// Identity & history: the fingerprint that follows this finding across runs
// (the hash stays still while the code moves), how often it has come back,
// what happened to it before, and every other occurrence in the corpus.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, ProofBadge, Stat } from "@/components/dash/kit";
import { relTime } from "@/components/dash/format";
import { useFindings } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { Skeleton } from "@/components/dash/kit";
import { CopyableValue } from "./CopyableValue";
import { locationRangeLabel } from "./format";
import s from "./detail.module.css";

const SHOWN = 5;

function Occurrences({ finding }: { finding: Finding }) {
  const enabled = Boolean(finding.fingerprint);
  const query = useFindings({ fingerprint: finding.fingerprint ?? undefined, limit: 50 }, { enabled });
  if (!enabled) return <p className={s.muted}>Not fingerprinted, so occurrences cannot be linked.</p>;
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }
  if (query.isError) return <p className={s.muted}>Could not load the other occurrences ({query.error.statusLabel}).</p>;
  const others = (query.data.items ?? []).filter((f) => f.id !== finding.id);
  if (others.length === 0) return <p className={s.muted}>This is the only occurrence in the corpus.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className={s.occList}>
        {others.slice(0, SHOWN).map((o) => (
          <li key={o.id}>
            <Link href={`/findings/${o.id}`} className={s.occ}>
              <span className={s.occPath}>{locationRangeLabel(o.location.file_path, o.location.start_line)}</span>
              <ProofBadge status={o.proof?.status ?? "not_attempted"} size="sm" />
              <span className={s.occWhen}>{relTime(o.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {others.length > SHOWN ? (
        <Link href={`/findings?fingerprint=${finding.fingerprint}&status=all`} className={s.inlineLink}>
          All {others.length + 1} occurrences <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export function IdentityCard({ finding }: { finding: Finding }) {
  const h = finding.history;
  const fp = finding.fingerprint;
  return (
    <Card as="section" tone="surface" pad="lg" className={s.cardBody} aria-labelledby="identity-title">
      <h2 id="identity-title" className={s.cardTitle}>
        Identity &amp; history
      </h2>
      <div className="flex flex-col gap-2">
        <p className={s.label}>Fingerprint</p>
        {fp ? (
          <CopyableValue label="fingerprint" display={`${fp.slice(0, 8)} ${fp.slice(8, 16)} … ${fp.slice(-8)}`} full={fp} className={`${s.fp} ${s.fpText}`} />
        ) : (
          <p className={s.muted}>Not fingerprinted.</p>
        )}
      </div>
      <div className={s.stats}>
        <Stat size="sm" label="Seen" value={h?.occurrence_count ?? 1} unit={(h?.occurrence_count ?? 1) === 1 ? "time" : "times"} />
        <Stat size="sm" label="Addressed" value={h?.previously_addressed ?? 0} />
        <Stat size="sm" label="Dismissed" value={h?.previously_dismissed ?? 0} />
      </div>
      {h?.first_seen_run_id ? (
        <p className={s.muted}>
          First seen in{" "}
          <Link href={`/runs/${h.first_seen_run_id}`} className={`${s.metaLink} ${s.metaMono}`}>
            run {h.first_seen_run_id.slice(0, 8)}
          </Link>
          {h.first_seen_run_id === finding.review_id ? ", this run." : "."}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className={s.label}>Other occurrences</p>
        <Occurrences finding={finding} />
      </div>
    </Card>
  );
}
