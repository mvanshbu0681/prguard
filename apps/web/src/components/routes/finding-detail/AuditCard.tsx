"use client";
// The audit trail snippet: every hash-chained event that names this finding,
// oldest first, each linking to its place in /audit, with the server's chain
// verdict for the window.
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, ShieldX } from "lucide-react";
import { Card, Skeleton, Tag } from "@/components/dash/kit";
import { dateTime } from "@/components/dash/format";
import { useAudit } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import s from "./detail.module.css";

const EVENT_LABEL: Record<string, string> = {
  "finding.proposed": "Proposed",
  "proof.executed": "Proof executed",
  "finding.published": "Published",
  "finding.suppressed": "Suppressed",
  "finding.disproven": "Refuted by execution",
  "finding.dropped": "Dropped",
  "suppression.created": "Suppression created",
  "suppression.revoked": "Suppression revoked",
  "gate.evaluated": "Gate evaluated",
};

function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function eventTone(type: string, payload: Record<string, unknown>): "lime" | "danger" | undefined {
  if (type === "proof.executed" && payload.proof_status === "proven") return "lime";
  if (type === "finding.published" && payload.blocking === true) return "danger";
  return undefined;
}

function eventDetail(type: string, actor: string | null | undefined, payload: Record<string, unknown>): string {
  const bits = [actor ?? null];
  if (type === "proof.executed" && typeof payload.proof_status === "string") bits.push(String(payload.proof_status));
  if (type === "finding.published" && typeof payload.delivery_mode === "string") bits.push(String(payload.delivery_mode).replace(/_/g, " "));
  return bits.filter(Boolean).join(" · ");
}

export function AuditCard({ finding }: { finding: Finding }) {
  const query = useAudit({ finding_id: finding.id, limit: 200 });
  const items = query.data?.items ?? [];
  const verified = query.data?.chain.verified;

  return (
    <Card as="section" tone="surface" pad="lg" className={s.cardBody} aria-labelledby="audit-title">
      <div className={s.cardHead}>
        <h2 id="audit-title" className={s.cardTitle}>
          Audit trail
        </h2>
        {query.data ? (
          verified ? (
            <Tag tone="ok" size="sm" icon={ShieldCheck}>
              Chain verified
            </Tag>
          ) : (
            <Tag tone="danger" size="sm" icon={ShieldX}>
              Chain broken
            </Tag>
          )
        ) : null}
      </div>
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : query.isError ? (
        <p className={s.muted}>Could not load the audit trail ({query.error.statusLabel}).</p>
      ) : items.length === 0 ? (
        <p className={s.muted}>No audit events name this finding.</p>
      ) : (
        <ol className={s.timeline}>
          {items.map((e) => {
            const payload = (e.payload ?? {}) as Record<string, unknown>;
            return (
              <li key={e.seq} className={s.event}>
                <span className={s.eventDot} data-tone={eventTone(e.event_type, payload)} aria-hidden />
                <span className={s.eventName}>{eventLabel(e.event_type)}</span>
                <Link href={`/audit?seq=${e.seq}`} className={s.eventSeq} title={dateTime(e.created_at)}>
                  #{e.seq}
                </Link>
                <span className={s.eventMeta}>{eventDetail(e.event_type, e.actor_id, payload)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 0 ? (
        <Link href={`/audit?finding_id=${finding.id}`} className={s.inlineLink}>
          Open in the audit log <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
    </Card>
  );
}
