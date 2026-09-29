// The ledger at a glance, composed like the landing's bento (asymmetric: one tall
// navy card, four working cards). Each card answers one governance question:
//   how much is silenced right now, and is that growing?   (navy, tall)
//   why do teams suppress?                                  (category mix)
//   how far does each one reach?                            (scope ladder — click to filter)
//   what is open-ended or about to lapse?                   (expiry)
//   who is doing the silencing?                             (people)
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar, AvatarStack, Card, Meter, StackBar, Tag } from "@/components/dash/kit";
import type { SuppressionScope } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, DAY_MS, SCOPE_LABEL, SCOPE_REACH, compactDays } from "./format";
import type { LedgerSummary as Summary } from "./ledger-model";
import { RichText } from "./RichText";
import { ReachMeter } from "./ScopeTarget";
import s from "./suppressions.module.css";

const CATEGORY_COLOR: Record<string, string> = {
  correctness: "var(--w-chart-1)",
  security: "var(--w-danger)",
  performance: "var(--w-chart-3)",
  maintainability: "var(--w-chart-5)",
  test_integrity: "var(--w-chart-4)",
  uncategorised: "var(--w-chart-6)",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(ms: number): string {
  const d = new Date(ms + DAY_MS); // the first day inside the week bin
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface LedgerSummaryProps {
  summary: Summary;
  nowMs: number;
  scope: SuppressionScope | null;
  onScope: (scope: SuppressionScope | null) => void;
  onReviewSecurity: () => void;
}

export function LedgerSummary({ summary, nowMs, scope, onScope, onReviewSecurity }: LedgerSummaryProps) {
  const { weekly } = summary;
  const thisWeek = weekly.at(-1) ?? 0;
  const maxWeek = Math.max(1, ...weekly);
  const weekStarts = weekly.map((_, i) => shortDay(nowMs - (weekly.length - i) * 7 * DAY_MS));
  const maxScope = Math.max(1, ...summary.byScope.map((c) => c.count));
  const next = summary.expiringSoon[0] ?? null;
  const people = summary.suppressors.length;

  return (
    <div className={s.bento}>
      {/* 1 — silenced right now */}
      <Card tone="navy" pad="lg" className={cn(s.bentoHero)}>
        <p className={s.navyLabel}>Silenced right now</p>
        <div className={s.navyFigure}>
          <span className={s.navyNumber}>{summary.active.toLocaleString("en-US")}</span>
          <span className={s.navyUnit}>active {summary.active === 1 ? "suppression" : "suppressions"}</span>
        </div>
        <p className={s.navyHint}>
          still silencing <b>{summary.silencedNow.toLocaleString("en-US")}</b> of those {summary.silenced.toLocaleString("en-US")} findings
        </p>

        <div className={s.weekly}>
          <div className={s.weeklyHead}>
            <span>New per week</span>
            <span className={s.weeklyNow}>
              <b>{thisWeek}</b> this week
            </span>
          </div>
          <div className={s.weekBars} role="img" aria-label={`Suppressions created per week, oldest first: ${weekly.join(", ")}`}>
            {weekly.map((v, i) => (
              <span key={i} className={s.weekCol} data-now={i === weekly.length - 1 ? "" : undefined}>
                <b>{v}</b>
                <i style={{ height: v ? `max(6px, calc((100% - 24px) * ${(v / maxWeek).toFixed(3)}))` : "3px", animationDelay: `${i * 60}ms` }} />
              </span>
            ))}
          </div>
          <div className={s.weeklyAxis} aria-hidden>
            {weekStarts.map((d, i) => (
              <span key={i}>{i === weekly.length - 1 ? "This wk" : d}</span>
            ))}
          </div>
        </div>

        <div className={s.navyStates}>
          <span>
            <i className={s.swActive} /> <b>{summary.active}</b> active
          </span>
          <span>
            <i className={s.swExpired} /> <b>{summary.expired}</b> expired
          </span>
          <span>
            <i className={s.swRevoked} /> <b>{summary.revoked}</b> revoked
          </span>
        </div>
      </Card>

      {/* 2 — why teams suppress */}
      <Card tone="surface" pad="lg" className={s.bentoCard}>
        <p className={s.cardLabel}>Why teams suppress</p>
        {summary.byCategory[0] ? (
          <p className={s.cardLead}>
            {CATEGORY_LABEL[summary.byCategory[0].key] ?? summary.byCategory[0].key}
            <span className={s.cardLeadSoft}>
              {" "}
              {summary.byCategory[0].count} of {summary.active}
            </span>
          </p>
        ) : (
          <p className={s.cardLead}>Nothing active</p>
        )}
        <StackBar
          size="lg"
          className="mt-auto"
          segments={summary.byCategory.map((c) => ({
            value: c.count,
            color: CATEGORY_COLOR[c.key] ?? "var(--w-chart-6)",
            label: (CATEGORY_LABEL[c.key] ?? c.key).toLowerCase(),
          }))}
          label={`Active suppressions by category: ${summary.byCategory.map((c) => `${c.count} ${c.key}`).join(", ")}`}
        />
        {summary.securityActive > 0 ? (
          <button type="button" className={s.securityNudge} onClick={onReviewSecurity}>
            <span>
              <b>{summary.securityActive}</b> security {summary.securityActive === 1 ? "finding is" : "findings are"} silenced
            </span>
            <span className={s.nudgeAction}>
              Review <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
            </span>
          </button>
        ) : null}
      </Card>

      {/* 3 — how far they reach */}
      <Card tone="surface" pad="lg" className={cn(s.bentoCard, s.bentoReach)}>
        <div className={s.cardHeadRow}>
          <p className={s.cardLabel}>How far they reach</p>
          {scope ? (
            <button type="button" className={s.cardClear} onClick={() => onScope(null)}>
              Any scope
            </button>
          ) : null}
        </div>
        <ul className={s.ladder} aria-label="Active suppressions by scope — select one to filter the ledger">
          {summary.byScope.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className={s.ladderRow}
                aria-pressed={scope === c.key}
                title={SCOPE_REACH[c.key]}
                onClick={() => onScope(scope === c.key ? null : c.key)}
              >
                <ReachMeter scope={c.key} />
                <span className={s.ladderLabel}>{SCOPE_LABEL[c.key]}</span>
                <span className={s.ladderTrack} aria-hidden>
                  <i style={{ width: `${(c.count / maxScope) * 100}%` }} />
                </span>
                <span className={s.ladderCount}>{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* 4 — expiry */}
      <Card tone="surface" pad="lg" className={s.bentoCard}>
        <p className={s.cardLabel}>Expiry</p>
        <p className={s.cardFigure}>
          {summary.openEnded}
          <span className={s.cardFigureUnit}>of {summary.active} never expire</span>
        </p>
        <Meter value={summary.active ? summary.openEnded / summary.active : 0} color="var(--w-warn)" label="Share of active suppressions with no expiry" />
        {next ? (
          <Link href={next.finding ? `/findings/${next.finding.id}` : "/suppressions"} className={s.nextExpiry}>
            <span className={s.nextExpiryTitle}>
              {next.finding ? <RichText text={next.finding.title} /> : (next.item.rule_key ?? next.item.suppression_id.slice(0, 8))}
            </span>
            <Tag tone="warn" size="sm">
              in {compactDays(next.expiresInDays ?? 0)}
            </Tag>
          </Link>
        ) : (
          <p className={s.cardNote}>Nothing lapses in the next 30 days.</p>
        )}
      </Card>

      {/* 5 — who suppresses */}
      <Card tone="surface" pad="lg" className={s.bentoCard}>
        <p className={s.cardLabel}>Who suppresses</p>
        <div className={s.peopleHead}>
          <AvatarStack max={3} size={34}>
            {summary.suppressors.map((p) => (
              <Avatar key={p.key} name={p.key} size={34} />
            ))}
          </AvatarStack>
          <span className={s.peopleCount}>
            <b>{people}</b> {people === 1 ? "person" : "people"}
          </span>
        </div>
        <ol className={s.peopleList}>
          {summary.suppressors.slice(0, 3).map((p) => (
            <li key={p.key}>
              <span className={s.peopleName}>{p.key}</span>
              <span className={s.peopleBar} aria-hidden>
                <i style={{ width: `${(p.count / (summary.suppressors[0]?.count || 1)) * 100}%` }} />
              </span>
              <span className={s.peopleNum}>{p.count}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
