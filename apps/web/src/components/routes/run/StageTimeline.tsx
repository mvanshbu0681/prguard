'use client';
// The nine-stage pipeline as one horizontal rail — the landing's pipeline card,
// drawn at full size. Each stage is a node and the line to the next one; the
// line's length is the stage's share of the run's time (with a floor so the
// 90ms stages stay legible), so the specialists and proof stages read as the
// long ones. The four specialist passes fork into parallel lanes. While a run is
// live the current stage glows and its line fills; the rail ends in the verdict.
// On a phone the same list stands up vertically, with a duration bar per stage.
import { CircleDashed, CircleSlash, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { GateBadge, type GateConclusion } from '@/components/dash/kit';
import { cn } from '@/lib/utils';
import { SPECIALIST_LANES, stageDuration, type StageView } from './stage-model';
import s from './rail.module.css';

const LANE_Y = [10, 25, 39, 54];

function Fork() {
  return (
    <span className={s.fork} aria-hidden>
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" className={s.forkSvg}>
        {LANE_Y.map((y, i) => (
          <path
            key={y}
            className={s.lane}
            style={{ ['--i' as string]: i } as CSSProperties}
            d={`M0 32 C 10 32, 8 ${y}, 18 ${y} H 82 C 92 ${y}, 90 32, 100 32`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {SPECIALIST_LANES.map((l, i) => (
        <span key={l.key} className={s.laneChip} style={{ top: LANE_Y[i], ['--i' as string]: i } as CSSProperties} title={l.name}>
          {l.initials}
        </span>
      ))}
    </span>
  );
}

function stateLabel(v: StageView, cancelled?: boolean): string {
  switch (v.state) {
    case 'done':
      return 'done';
    case 'running':
      return 'running';
    case 'degraded':
      return 'running, heartbeat late';
    case 'failed':
      return cancelled ? 'cancelled here' : 'stopped here';
    default:
      return 'not reached';
  }
}

export interface StageTimelineProps {
  views: StageView[];
  /** 0–1, how far the running stage has got. */
  progress?: number;
  /** The verdict at the end of the rail; `running` while live, null when the run never reached one. */
  verdict: GateConclusion;
  /** The run was cancelled (e.g. superseded): its last stage stopped rather than failed. */
  cancelled?: boolean;
  className?: string;
}

export function StageTimeline({ views, progress = 0, verdict, cancelled, className }: StageTimelineProps) {
  const maxWeight = Math.max(...views.map((v) => v.weight), 1);
  return (
    <div className={cn(s.host, className)}>
      <ol className={s.rail} aria-label="Pipeline: nine stages">
        {views.map((v) => {
          const Icon = v.meta.icon;
          const live = v.state === 'running' || v.state === 'degraded';
          const fill = v.state === 'done' ? 1 : live ? progress : 0;
          return (
            <li
              key={v.key}
              className={s.stage}
              data-state={cancelled && v.state === 'failed' ? 'stopped' : v.state}
              data-stage={v.key}
              style={{ flexGrow: v.weight, ['--share' as string]: v.weight / maxWeight } as CSSProperties}
              aria-label={`Stage ${v.index}, ${v.meta.name}: ${stateLabel(v, cancelled)}${v.ms != null ? `, ${v.kind === 'typical' ? 'typically ' : ''}${stageDuration(v.ms)}` : ''}`}
            >
              <span className={s.track} aria-hidden>
                <span className={s.node}>
                  {v.state === 'failed' ? (
                    cancelled ? (
                      <CircleSlash size={15} strokeWidth={2} />
                    ) : (
                      <X size={16} strokeWidth={2.2} />
                    )
                  ) : (
                    <Icon size={16} strokeWidth={1.9} />
                  )}
                </span>
                {v.key === 'specialists' ? (
                  <Fork />
                ) : (
                  <span className={s.line}>
                    <i className={s.fill} style={{ ['--fill' as string]: fill } as CSSProperties} />
                  </span>
                )}
              </span>
              <span className={s.caption} aria-hidden>
                <span className={s.nameRow}>
                  <span className={s.name}>{v.meta.name}</span>
                  {v.key === 'specialists' ? <span className={s.parallel}>×4 in parallel</span> : null}
                </span>
                <span className={s.ms}>
                  <span className={s.idx}>{String(v.index).padStart(2, '0')}</span>
                  {live ? (
                    <span className={s.msLive}>running</span>
                  ) : v.state === 'failed' ? (
                    <span className={s.msFailed}>stopped</span>
                  ) : v.ms != null ? (
                    <span>
                      {v.kind === 'typical' ? <span className={s.approx}>~</span> : null}
                      {stageDuration(v.ms)}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </span>
                <span className={s.durBar}>
                  <i />
                </span>
              </span>
            </li>
          );
        })}
        <li className={s.end} data-verdict-end={verdict ?? 'none'} aria-label={`Merge gate: ${verdict ?? 'no verdict'}`}>
          <span className={s.endTrack} aria-hidden>
            {verdict ? (
              <GateBadge conclusion={verdict} size="lg" />
            ) : (
              <span className={s.noVerdict}>
                <CircleDashed size={12} strokeWidth={2} /> No verdict
              </span>
            )}
          </span>
          <span className={s.caption} aria-hidden>
            <span className={s.nameRow}>
              <span className={s.name}>Merge gate</span>
            </span>
          </span>
        </li>
      </ol>
    </div>
  );
}
