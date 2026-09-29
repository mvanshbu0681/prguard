'use client';
// The slim band above the timeline: how busy the window was (reviews per day, the
// blocked ones in red), how the merge gate came out, and what a typical review
// costs in time and money. One grey card split three ways, not three stat tiles.
import { GATE_COLOR, Skeleton, StackBar } from '@/components/dash/kit';
import { seconds, shortDate, usd } from '@/components/dash/format';
import { cn } from '@/lib/utils';
import type { RunsSummary as Summary } from './model';
import s from './runs-list.module.css';

function DayBars({ days }: { days: Summary['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  const peak = days.reduce((a, d) => Math.max(a, d.total), 0);
  return (
    <div className={s.bars} role="img" aria-label={`Reviews per day, ${days.length} days, peak ${peak}`}>
      {days.map((d) => (
        <span key={d.key} className={s.bar} title={`${shortDate(d.key)} · ${d.total} review${d.total === 1 ? '' : 's'}${d.blocked ? ` · ${d.blocked} blocked` : ''}`}>
          <span className={s.barCol} style={{ height: `${d.total ? Math.max(8, (d.total / max) * 100) : 0}%` }}>
            {d.blocked ? <i className={s.barBlocked} style={{ flexGrow: d.blocked }} /> : null}
            {d.total - d.blocked > 0 ? <i className={s.barRest} style={{ flexGrow: d.total - d.blocked }} /> : null}
          </span>
        </span>
      ))}
    </div>
  );
}

export function RunsSummary({ summary, loading, filtered }: { summary: Summary | null; loading?: boolean; filtered?: boolean }) {
  if (loading || !summary) {
    return (
      <div className={s.summary} aria-hidden>
        <div className={s.sumCell}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-14 w-full" />
        </div>
        <div className={s.sumCell}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-10 w-20" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
        <div className={s.sumCell}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-10 w-24" />
        </div>
      </div>
    );
  }
  const { gate, days } = summary;
  const decided = gate.blocked + gate.clear + gate.neutral;
  const blockedShare = decided ? Math.round((gate.blocked / decided) * 100) : null;
  return (
    <section className={s.summary} aria-label="Summary of the window">
      <div className={cn(s.sumCell, s.sumActivity)}>
        <div className={s.sumHead}>
          <span className={s.sumLabel}>Reviews per day</span>
          <span className={s.sumFigure}>
            {summary.perDay != null ? summary.perDay.toFixed(1) : '—'}
            <small>avg</small>
          </span>
        </div>
        <DayBars days={days} />
        <div className={s.axis} aria-hidden>
          <span>{days[0] ? shortDate(days[0].key) : ''}</span>
          <span className={s.axisKey}>
            <i className={s.keyBlocked} /> blocked
          </span>
          <span>{days.length ? 'Today' : ''}</span>
        </div>
      </div>

      <div className={s.sumCell}>
        <span className={s.sumLabel}>Merge gate</span>
        <p className={s.sumBig}>
          {blockedShare != null ? blockedShare : '—'}
          <span className={s.sumUnit}>%</span>
        </p>
        <p className={s.sumHint}>held by a proven bug</p>
        <StackBar
          className="mt-4"
          label={`${gate.blocked} blocked, ${gate.clear} clear, ${gate.neutral} neutral, ${gate.noVerdict} without a verdict`}
          segments={[
            { value: gate.blocked, color: GATE_COLOR.failure, label: 'blocked' },
            { value: gate.clear, color: GATE_COLOR.success, label: 'clear' },
            { value: gate.neutral, color: GATE_COLOR.neutral, label: 'neutral' },
            { value: gate.noVerdict, color: 'var(--w-faint)', label: 'no verdict' },
          ]}
        />
      </div>

      <div className={cn(s.sumCell, s.sumPair)}>
        <div>
          <span className={s.sumLabel}>{filtered ? `Median of these ${summary.runs}` : 'Median review'}</span>
          <p className={s.sumBig}>
            {summary.medianDuration == null ? (
              '—'
            ) : summary.medianDuration < 90 ? (
              <>
                {summary.medianDuration.toFixed(1)}
                <span className={s.sumUnit}>s</span>
              </>
            ) : (
              seconds(summary.medianDuration)
            )}
          </p>
        </div>
        <div>
          <span className={s.sumLabel}>{filtered ? 'Their median cost' : 'Median cost'}</span>
          <p className={s.sumBig}>{usd(summary.medianCost)}</p>
        </div>
      </div>
    </section>
  );
}
