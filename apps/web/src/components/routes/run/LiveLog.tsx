'use client';
// The live log: one line per change between two polls, stamped with how far into
// the run it was seen. New lines rise in at the bottom; the current stage's line
// carries a live dot until the next one replaces it.
import { Card, Dot } from '@/components/dash/kit';
import { cn } from '@/lib/utils';
import { logStamp, type LogEvent } from './live-model';
import s from './run.module.css';

export function LiveLog({ events, live, elapsed, className }: { events: LogEvent[]; live: boolean; elapsed: string; className?: string }) {
  const lastStart = live ? [...events].reverse().find((e) => e.tone === 'live')?.id : undefined;
  return (
    <Card tone="surface" pad="lg" className={className} as="section" aria-labelledby="log-h">
      <div className={s.panelHead}>
        <h2 id="log-h" className={s.panelTitle}>
          {live ? 'Live log' : 'Run log'}
        </h2>
        <span className={s.logClock}>
          {live ? <Dot color="var(--w-blue)" pulse /> : null}
          {elapsed}
        </span>
      </div>
      {events.length === 0 ? (
        <p className={s.panelNote}>Waiting for the first heartbeat…</p>
      ) : (
        <ol className={s.log} aria-live="polite" aria-relevant="additions">
          {events.map((e) => (
            <li key={e.id} className={cn(s.logLine, s[`log_${e.tone}`], e.id === lastStart && s.logCurrent)}>
              <span className={s.logAt}>{logStamp(e.at)}</span>
              <span className={s.logText}>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
