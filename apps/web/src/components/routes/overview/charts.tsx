// Bespoke charts for /overview. Kit primitives (Sparkline, Meter…) cover the
// small cases; these are the shapes only this page draws. Proof outcomes and
// gate verdicts always take their colour from the kit's PROOF_COLOR /
// GATE_COLOR; everything else is a --w-* token (or white on the photograph).
// Changes animate with clip-path and transform only (motion lint).
import type { CSSProperties } from 'react';
import { GATE_COLOR, PROOF_COLOR } from '@/components/dash/kit';
import { pct, shortDate } from '@/components/dash/format';
import type { FunnelStats, HistBin, StageLatency, WeekRow } from './model';
import { stageLabel } from './format';
import s from './overview.module.css';

/* ------------------------------------------------------------------------ */
/* Hero: proven bugs per week, white on the photograph                       */
/* ------------------------------------------------------------------------ */

export function WeekBars({ weeks, active }: { weeks: WeekRow[]; active: readonly string[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.proven));
  const on = new Set(active);
  const label = weeks.map((w) => `${shortDate(w.week)}: ${w.proven}${w.partial ? ' so far' : ''}`).join(', ');
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return (
    <div role="img" aria-label={`Proven bugs per week. ${label}`}>
      <div className={s.wbars}>
        {weeks.map((w) => (
          <div key={w.week} className={s.wbarCol} data-dim={on.has(w.week) ? undefined : ''}>
            <span className={s.wbarVal}>{w.proven}</span>
            <i className={s.wbar} data-partial={w.partial ? '' : undefined} style={{ height: `calc(${w.proven / max} * (100% - 17px))` }} />
          </div>
        ))}
      </div>
      {first ? (
        <div className={s.wbarAxis} aria-hidden>
          <span>{shortDate(first.week)}</span>
          <span>{last.partial ? 'so far' : shortDate(last.week)}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Lime card: one pill per held PR, in the gate's colours                    */
/* ------------------------------------------------------------------------ */

/** Still blocked = GATE_COLOR.failure (solid red); fixed = hollow, so the lime card (clear) shows through. */
export function HeldPips({ fixed }: { fixed: boolean[] }) {
  const done = fixed.filter(Boolean).length;
  return (
    <div className={s.pips} role="img" aria-label={`${fixed.length} pull requests held: ${done} fixed and cleared, ${fixed.length - done} still blocked`}>
      {fixed.map((f, i) => (
        <i key={i} data-k={f ? 'fixed' : 'blocked'} style={f ? undefined : { background: GATE_COLOR.failure }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Ink card: where a review's time goes, one segment per stage               */
/* ------------------------------------------------------------------------ */

export function StageTrack({ stages }: { stages: StageLatency[] }) {
  const top = stages.reduce((a, b) => (b.p50 > a.p50 ? b : a), stages[0]);
  return (
    <div className={s.track} role="img" aria-label={stages.map((st) => `${stageLabel(st.stage)} ${st.p50.toFixed(1)}s`).join(', ')}>
      {stages.map((st) => (
        <i
          key={st.stage}
          style={{ flexGrow: st.p50 }}
          data-tone={st === top ? 'lead' : st.p50 >= top.p50 / 4 ? 'mid' : undefined}
          title={`${stageLabel(st.stage)} · p50 ${st.p50.toFixed(2)}s`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The noise filter: a centred funnel whose bars are joined by soft ribbons  */
/* ------------------------------------------------------------------------ */

interface FunnelExit {
  n: number;
  label: string;
  /** Printed as a loss ("−122") rather than a count. */
  loss?: boolean;
  /** A rate that explains the line, in plain type. */
  note?: string;
  color?: string;
}

interface FunnelStage {
  key: string;
  label: string;
  sub: string;
  n: number;
  color: string;
  exits: FunnelExit[];
}

/** Volume, not an outcome: a neutral ramp of the text colour (the proof code keeps lime, ink and greys for itself). */
const volume = (pctOfText: number) => `color-mix(in srgb, var(--w-text) ${pctOfText}%, var(--w-surface))`;

export interface FunnelNotes {
  /** Published findings per review in the window. */
  perReview: number | null;
  /** Proof runs in the window (the refuted rate's n). */
  attempted: number;
}

function stagesOf(f: FunnelStats, notes: FunnelNotes): FunnelStage[] {
  const refutedRate = notes.attempted ? `${pct(f.refuted / notes.attempted, 1)} of ${notes.attempted} proof runs` : undefined;
  return [
    { key: 'raised', label: 'Raised', sub: 'by four specialists', n: f.raised, color: volume(16), exits: [] },
    {
      key: 'kept',
      label: 'Kept',
      sub: 'by the coordinator',
      n: f.kept,
      color: volume(34),
      exits: [{ n: f.dropped, label: 'dropped as noise or duplicates', loss: true }],
    },
    {
      key: 'published',
      label: 'Published',
      sub: notes.perReview == null ? 'as PR comments' : `${notes.perReview.toFixed(2)} per review`,
      n: f.published,
      color: volume(72),
      exits: (
        [
          { n: f.suppressed, label: 'suppressed by your rules', loss: true },
          { n: f.refuted, label: 'refuted by their own test', loss: true, note: refutedRate, color: PROOF_COLOR.disproven },
          { n: f.unresolved, label: 'left unresolved', loss: true },
        ] as FunnelExit[]
      ).filter((e) => e.n > 0),
    },
    {
      key: 'proven',
      label: 'Proven',
      sub: 'on published findings',
      n: f.proven,
      color: PROOF_COLOR.proven,
      exits: (
        [
          { n: f.advisory, label: 'posted without proof, as advice', loss: true },
          { n: f.blocking, label: 'of these held the merge gate', color: GATE_COLOR.failure },
          { n: f.provenSuppressed, label: `more proven, then suppressed (${f.proven + f.provenSuppressed} in all)`, color: PROOF_COLOR.proven },
        ] as FunnelExit[]
      ).filter((e) => e.n > 0),
    },
  ];
}

/** Inset of a centred bar of `share` (0..1) of the track, as a clip-path percentage per side. */
function side(share: number): number {
  return ((1 - Math.max(0, Math.min(1, share))) / 2) * 100;
}

export function NoiseFunnel({ f, notes }: { f: FunnelStats; notes: FunnelNotes }) {
  const stages = stagesOf(f, notes);
  const base = f.raised || 1;
  return (
    <ol className={s.funnel} aria-label="The noise filter">
      {stages.map((st, i) => {
        const share = st.n / base;
        const next = stages[i + 1];
        const vars = {
          '--a': `${side(share)}%`,
          '--b': `${next ? side(next.n / base) : side(share)}%`,
          '--c': st.color,
          '--c2': next?.color ?? st.color,
        } as CSSProperties;
        return (
          <li key={st.key} className={s.fRow} data-stage={st.key} style={vars}>
            <div className={s.fHead}>
              <span className={s.fNum}>{st.n}</span>
              <span className={s.fLabel}>
                {st.label}
                <span className={s.fPct}>{i === 0 ? '100%' : `${Math.round(share * 100)}%`}</span>
              </span>
              <span className={s.fSub}>{st.sub}</span>
            </div>
            <div className={s.fViz} aria-hidden>
              <span className={s.fBar} />
              {next ? <span className={s.fRibbon} /> : null}
            </div>
            <ul className={s.fExits}>
              {st.exits.map((e) => (
                <li key={e.label}>
                  {e.color ? <i className={s.fDot} style={{ background: e.color }} aria-hidden /> : null}
                  <span>
                    <b>
                      {e.loss ? '−' : ''}
                      {e.n}
                    </b>{' '}
                    {e.label}
                    {e.note ? <span className={s.fNote}>{e.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------------ */
/* Spend: cost per review histogram with p50 / p95 markers                   */
/* ------------------------------------------------------------------------ */

export function CostHistogram({ bins, p50, p95 }: { bins: HistBin[]; p50: number | null; p95: number | null }) {
  const max = Math.max(1, ...bins.map((b) => b.runs));
  const lo = bins[0]?.start ?? 0;
  const hi = bins[bins.length - 1]?.end ?? 1;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const p50Bin = p50 == null ? -1 : bins.findIndex((b) => p50 >= b.start && p50 < b.end);
  return (
    <div className={s.hist}>
      <div className={s.histPlot} role="img" aria-label={bins.map((b) => `$${b.start.toFixed(2)}–$${b.end.toFixed(2)}: ${b.runs} reviews`).join(', ')}>
        {bins.map((b, i) => (
          <span key={b.start} className={s.histCol}>
            <i style={{ height: `${Math.max(b.runs ? 4 : 0, (b.runs / max) * 100)}%` }} data-lead={i === p50Bin ? '' : undefined} />
          </span>
        ))}
        {p50 != null ? <Marker left={at(p50)} label="p50" /> : null}
        {p95 != null ? <Marker left={at(p95)} label="p95" quiet /> : null}
      </div>
      <div className={s.histAxis} aria-hidden>
        <span>${lo.toFixed(2)}</span>
        <span>${((lo + hi) / 2).toFixed(2)}</span>
        <span>${hi.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Marker({ left, label, quiet }: { left: string; label: string; quiet?: boolean }) {
  return (
    <span className={s.marker} data-quiet={quiet ? '' : undefined} style={{ left }} aria-hidden>
      <span>{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Speed: per-stage p50 with the p95 tail                                    */
/* ------------------------------------------------------------------------ */

export function StageRows({ stages }: { stages: StageLatency[] }) {
  const max = Math.max(...stages.map((st) => st.p95), 1);
  const lead = stages.reduce((a, b) => (b.p50 > a.p50 ? b : a), stages[0]);
  return (
    <ul className={s.stages}>
      {stages.map((st) => (
        <li key={st.stage} data-lead={st === lead ? '' : undefined}>
          <span className={s.stName}>{stageLabel(st.stage)}</span>
          <span className={s.stTrack} aria-hidden>
            <i className={s.stTail} style={{ width: `${(st.p95 / max) * 100}%` }} />
            <i className={s.stBar} style={{ width: `${Math.max(1.2, (st.p50 / max) * 100)}%` }} />
          </span>
          <span className={s.stVal}>
            {fmtS(st.p50)}
            <span>{fmtS(st.p95)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function fmtS(v: number): string {
  if (v < 1) return `${v.toFixed(2)}s`;
  return `${v.toFixed(1)}s`;
}
