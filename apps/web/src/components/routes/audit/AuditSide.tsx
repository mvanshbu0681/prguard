// The chain's shape beside the log: how busy it has been, who acts on it (the
// pipeline, Witness itself, people), and — loudest, because it is the one event a
// governance lead must never miss — every break-glass override.
import Link from "next/link";
import { ArrowUpRight, Siren } from "lucide-react";
import { Avatar, AvatarStack, Card, MiniBars, StackBar } from "@/components/dash/kit";
import { relTime } from "@/components/dash/format";
import { formatUtcStamp } from "@/components/routes/suppressions/format";
import { dayLabel, describe, type ActorMix, type AuditEvent } from "./audit-model";
import s from "./audit.module.css";

export interface AuditSideProps {
  daily: { day: string; count: number }[];
  mix: ActorMix;
  total: number;
  breakGlass: AuditEvent[];
  nowMs: number;
  onShowSeq: (seq: number) => void;
}

export function AuditSide({ daily, mix, total, breakGlass, nowMs, onShowSeq }: AuditSideProps) {
  const peak = daily.reduce((m, d) => (d.count > m.count ? d : m), daily[0] ?? { day: "", count: 0 });
  const today = daily.at(-1)?.count ?? 0;
  return (
    <aside className={s.side} aria-label="Chain activity">
      {breakGlass.length > 0 ? (
        <div className={s.alarmCard}>
          <p className={s.alarmLabel}>
            <Siren size={14} strokeWidth={2} aria-hidden />
            {breakGlass.length === 1 ? "1 break-glass override" : `${breakGlass.length} break-glass overrides`}
          </p>
          {breakGlass.slice(0, 2).map((e) => (
            <button key={e.seq} type="button" className={s.alarmItem} onClick={() => onShowSeq(e.seq)}>
              <span className={s.alarmWho}>
                <Avatar name={e.actor_id ?? "someone"} size={24} />
                <b>{e.actor_id ?? "someone"}</b>
                <span title={formatUtcStamp(e.created_at)}>{relTime(e.created_at, nowMs)}</span>
                <span className={s.alarmSeq}>#{e.seq.toLocaleString("en-US")}</span>
              </span>
              <span className={s.alarmReason}>{describe(e)}</span>
              <span className={s.alarmGo}>
                Show in chain <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Card tone="surface" pad="lg" className={s.sideCard}>
        <p className={s.sideLabel}>Activity</p>
        <p className={s.sideFigure}>
          {total.toLocaleString("en-US")}
          <span>events</span>
        </p>
        {daily.length ? (
          <>
            <MiniBars
              values={daily.map((d) => d.count)}
              width={300}
              height={56}
              color="var(--w-chart-1)"
              className={s.sideBars}
              label={`Events per day, last ${daily.length} days`}
            />
            <div className={s.sideAxis} aria-hidden>
              <span>{dayLabel(daily[0].day, false)}</span>
              <span>{dayLabel(daily.at(-1)!.day, false)}</span>
            </div>
            <p className={s.sideNote}>
              Busiest day {dayLabel(peak.day)} with <b>{peak.count}</b> events; <b>{today}</b> on the latest.
            </p>
          </>
        ) : null}
      </Card>

      <Card tone="surface" pad="lg" className={s.sideCard}>
        <p className={s.sideLabel}>Who acts on the chain</p>
        <StackBar
          size="lg"
          segments={[
            { value: mix.system, color: "var(--w-chart-5)", label: "pipeline" },
            { value: mix.witness, color: "var(--w-chart-1)", label: "Witness" },
            { value: mix.human, color: "var(--w-chart-3)", label: "people" },
          ]}
          label={`${mix.system} pipeline, ${mix.witness} Witness, ${mix.human} people`}
        />
        {mix.people.length ? (
          <div className={s.peopleRow}>
            <AvatarStack max={3} size={34}>
              {mix.people.map((p) => (
                <Avatar key={p.name} name={p.name} size={34} />
              ))}
            </AvatarStack>
            <span className={s.sideNote}>
              <b>{mix.people.length}</b> {mix.people.length === 1 ? "person" : "people"} · {mix.human.toLocaleString("en-US")} human actions
            </span>
          </div>
        ) : null}
        <Link href="/audit?actor_type=human" className={s.sideLink} scroll={false}>
          Only people&rsquo;s actions <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
        </Link>
      </Card>
    </aside>
  );
}
