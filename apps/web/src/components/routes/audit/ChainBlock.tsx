"use client";
// One event on the chain: who (actor avatar on the rail), what (a type tag and one
// plain sentence), what it touched (run / finding / suppression links), when
// (relative, exact on hover) and its two hashes. Expanding shows the payload as
// pretty JSON, the full hashes with the browser's recomputation, and the exact
// bytes that were hashed. Between two blocks sits a HashLink: the newer block's
// prev_hash, which must equal the older block's event_hash.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  Crosshair,
  EyeOff,
  FlaskConical,
  FlaskConicalOff,
  GitPullRequest,
  Link2,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  Siren,
  Square,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { stringify } from "lossless-json";
import { memo, useState } from "react";
import { Tag, type TagTone } from "@/components/dash/kit";
import { relTime } from "@/components/dash/format";
import { firstDifferingNibble, type ChainVerifyRow } from "@/lib/audit-verify";
import { auditHashDocument, canonicalJson } from "@/lib/canonical-json";
import { cn } from "@/lib/utils";
import { formatUtcStamp } from "@/components/routes/suppressions/format";
import { ActorAvatar } from "./ActorAvatar";
import { actorView, describe, eventTone, isQuote, typeLabel, type AuditEvent, type EventTone } from "./audit-model";
import s from "./audit.module.css";

const TONE_TAG: Record<EventTone, TagTone> = { neutral: "soft", ok: "ok", danger: "danger", warn: "warn", refuted: "outline" };

function typeIcon(e: AuditEvent): LucideIcon {
  switch (e.event_type) {
    case "review.requested":
    case "review.started":
      return GitPullRequest;
    case "review.stage_completed":
      return ListChecks;
    case "review.degraded":
      return TriangleAlert;
    case "review.failed":
      return CircleX;
    case "review.completed":
      return CircleCheck;
    case "finding.proposed":
      return Crosshair;
    case "finding.published":
      return MessageSquare;
    case "finding.disproven":
      return FlaskConicalOff;
    case "finding.suppressed":
    case "suppression.created":
    case "suppression.revoked":
      return EyeOff;
    case "proof.generated":
    case "proof.executed":
      return FlaskConical;
    case "gate.evaluated":
      return e.payload && (e.payload as { conclusion?: string }).conclusion === "failure" ? Square : ShieldCheck;
    case "gate.delivered":
      return ShieldCheck;
    case "override.break_glass":
      return Siren;
    default:
      return Link2;
  }
}

/** A hash with the first nibble at which it departs from `against` marked. */
function MarkedHash({ hash, against }: { hash: string; against: string }) {
  const at = firstDifferingNibble(hash, against);
  if (at === null) return <>{hash}</>;
  return (
    <>
      {hash.slice(0, at)}
      <mark className={s.nibble}>{hash[at]}</mark>
      {hash.slice(at + 1)}
    </>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Denied or unavailable: the hash is still visible and selectable.
  }
}

export type BlockState = "pending" | "intact" | "broken" | "after";

export interface ChainBlockProps {
  event: AuditEvent;
  /** The (possibly tampered) event the browser hashed, when it differs from `event`. */
  hashed: AuditEvent | null;
  row: ChainVerifyRow | null;
  state: BlockState;
  expanded: boolean;
  highlight: boolean;
  onToggle: (seq: number) => void;
  nowMs: number;
}

export const ChainBlock = memo(function ChainBlock({ event, hashed, row, state, expanded, highlight, onToggle, nowMs }: ChainBlockProps) {
  const [copied, setCopied] = useState(false);
  const actor = actorView(event);
  const tone = eventTone(event);
  const Icon = typeIcon(event);
  const sentence = describe(hashed ?? event);
  const quote = isQuote(event.event_type) && sentence;
  const breakGlass = event.event_type === "override.break_glass";
  const panelId = `audit-event-${event.seq}`;
  const shownPayload = (hashed ?? event).payload ?? {};

  return (
    <li
      className={cn(s.block, breakGlass && s.blockAlarm, highlight && s.blockHighlight)}
      data-seq={event.seq}
      data-state={state}
      data-highlight={highlight ? "" : undefined}
    >
      <div className={s.blockRail}>
        <ActorAvatar actor={actor} size={34} />
      </div>
      <div className={s.blockCard}>
        <button type="button" className={s.blockHead} aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggle(event.seq)}>
          <span className={s.seq}>#{event.seq.toLocaleString("en-US")}</span>
          <Tag tone={TONE_TAG[tone]} size="sm" icon={Icon} className={s.typeTag}>
            {typeLabel(event.event_type)}
          </Tag>
          {quote ? null : <span className={s.sentence}>{sentence}</span>}
          <time className={s.time} dateTime={event.created_at} title={formatUtcStamp(event.created_at)}>
            {relTime(event.created_at, nowMs)}
          </time>
          <ChevronDown size={16} strokeWidth={1.9} className={s.chevron} aria-hidden />
        </button>

        {quote ? <blockquote className={s.quote}>{sentence}</blockquote> : null}

        <div className={s.blockMeta}>
          <span className={s.actorName}>
            <b>{actor.name}</b>
            {actor.detail ? <span> · {actor.detail}</span> : null}
          </span>
          {event.review_id ? (
            <Link href={`/runs/${event.review_id}`} className={s.target}>
              <GitPullRequest size={12} strokeWidth={2} aria-hidden />
              run {event.review_id.slice(0, 7)}
            </Link>
          ) : null}
          {event.finding_id ? (
            <Link href={`/findings/${event.finding_id}`} className={s.target}>
              <Crosshair size={12} strokeWidth={2} aria-hidden />
              finding {event.finding_id.slice(0, 8)}
            </Link>
          ) : null}
          {event.event_type.startsWith("suppression.") || event.event_type === "finding.suppressed" ? (
            <Link href="/suppressions?active=false" className={s.target}>
              <EyeOff size={12} strokeWidth={2} aria-hidden />
              suppression {String((event.payload as { suppression_id?: string } | null)?.suppression_id ?? "").slice(0, 8)}
            </Link>
          ) : null}
          <span className={s.hashPair} title={`prev_hash ${event.prev_hash ?? "(genesis)"}\nevent_hash ${event.event_hash}`}>
            <span className={s.hashPrev}>{event.prev_hash ? event.prev_hash.slice(0, 8) : "genesis"}</span>
            <span aria-hidden>→</span>
            <span className={cn(s.hashOwn, state === "broken" && s.hashBad)}>{event.event_hash.slice(0, 8)}</span>
          </span>
        </div>

        {expanded ? (
          <div className={s.panel} id={panelId}>
            {hashed ? (
              <p className={s.tamperNote}>
                <TriangleAlert size={14} strokeWidth={2} aria-hidden /> Tamper demo: this payload was edited in your browser. Nothing on the server changed.
              </p>
            ) : null}
            <div className={s.panelGrid}>
              <div className={s.panelCol}>
                <p className={s.panelLabel}>Payload</p>
                <pre className={s.code} tabIndex={0} role="region" aria-label={`Payload of event #${event.seq}`}>
                  {stringify(shownPayload, undefined, 2) ?? "{}"}
                </pre>
              </div>
              <div className={s.panelCol}>
                <p className={s.panelLabel}>Hashes</p>
                <dl className={s.hashTable}>
                  <dt>prev_hash</dt>
                  <dd>{event.prev_hash ?? "— genesis —"}</dd>
                  <dt>event_hash</dt>
                  <dd>{event.event_hash}</dd>
                  <dt>recomputed</dt>
                  <dd className={cn(row && row.computed !== row.expected && s.hashBad)}>
                    {row ? (
                      <>
                        <MarkedHash hash={row.computed} against={row.expected} />
                        <span className={s.verdict}>
                          {row.computed === row.expected ? (
                            <>
                              <CircleCheck size={13} strokeWidth={2.2} aria-hidden /> matches
                            </>
                          ) : (
                            <>
                              <CircleX size={13} strokeWidth={2.2} aria-hidden /> does not match
                            </>
                          )}
                        </span>
                      </>
                    ) : (
                      <span className={s.muted}>not checked in this browser</span>
                    )}
                  </dd>
                </dl>
                {row && !row.linked ? (
                  <p className={s.unlinked}>
                    <Unlink size={13} strokeWidth={2} aria-hidden /> prev_hash no longer links to #{(event.seq - 1).toLocaleString("en-US")}
                  </p>
                ) : null}
                <p className={s.panelLabel}>Hashed bytes</p>
                <code className={s.canonical} tabIndex={0} role="region" aria-label={`Hashed bytes of event #${event.seq}`}>
                  {canonicalJson(
                    auditHashDocument({
                      tenant_id: (hashed ?? event).tenant_id ?? "",
                      seq: event.seq,
                      event_type: event.event_type,
                      actor_type: (hashed ?? event).actor_type,
                      actor_id: (hashed ?? event).actor_id,
                      payload: (shownPayload ?? {}) as Record<string, unknown>,
                      created_at: event.created_at,
                    }),
                  )}
                </code>
                <p className={s.formula}>sha256(prev_hash ‖ canonical_json) = event_hash</p>
                <div className={s.panelActions}>
                  <button
                    type="button"
                    className={s.miniBtn}
                    onClick={() => {
                      void copy(event.event_hash);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    <Copy size={12} strokeWidth={2} aria-hidden /> {copied ? "Copied" : "Copy hash"}
                  </button>
                  <Link href={`/audit?seq=${event.seq}`} className={s.miniBtn} scroll={false}>
                    <Link2 size={12} strokeWidth={2} aria-hidden /> Permalink
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
});

export type LinkState = "pending" | "linked" | "broken" | "after" | "gap";

/** The connector between a block and the (older) one below it: a muted mono label on
 *  the line (the newer block's prev_hash, which must equal the older block's
 *  event_hash). Only a break is loud — red, dashed, and it says so. */
export function HashLink({ hash, state, hidden }: { hash: string | null; state: LinkState; hidden?: number }) {
  if (state === "gap") {
    return (
      <li className={s.link} data-state="gap" aria-hidden>
        <span className={s.linkLabel}>
          {hidden ? `${hidden.toLocaleString("en-US")} ${hidden === 1 ? "event" : "events"} not shown` : "not shown"}
        </span>
      </li>
    );
  }
  return (
    <li className={s.link} data-state={state} aria-hidden>
      <span className={s.linkLabel} title={hash ? `prev_hash ${hash}` : undefined}>
        {state === "broken" ? <Unlink size={11} strokeWidth={2.2} /> : null}
        {hash ? hash.slice(0, 8) : "genesis"}
        {state === "broken" ? <span className={s.linkWord}>link broken</span> : null}
      </span>
    </li>
  );
}
