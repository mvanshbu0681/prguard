"use client";
// Two questions a reviewer actually asks of a severity score:
//   Calibration — does a higher score mean the author fixes it more often?
//     Each band's mean score (x) against its addressed rate (y); dot area
//     scales with n, the whisker is the Wilson 95% interval, the dashed
//     diagonal is a reference (a score is not a probability, so it is not a
//     target). The band scale under the x axis is the policy's own thresholds.
//   Dismissals — which kinds of finding do reviewers throw away? Dismissed ÷
//     published per category, the pale band its interval, the dashed tick the
//     all-category rate.
import { useState } from "react";
import { Card, SectionHeader, Tag, bandColor } from "@/components/dash/kit";
import { humanize } from "@/components/dash/format";
import type { AccuracySeriesExt } from "@/components/charts";
import { SEVERITY_THRESHOLDS } from "@/lib/contracts";
import { calibrationPoints, calibrationReading, dismissalRows, percent, ratio, type CalibrationPoint } from "./derive";
import { useWidth } from "./use-width";
import s from "./accuracy.module.css";

const H = 300;
const M = { t: 14, r: 18, b: 44, l: 40 };
const BANDS: { band: string; from: number; to: number }[] = [
  { band: "info", from: 0, to: SEVERITY_THRESHOLDS.low },
  { band: "low", from: SEVERITY_THRESHOLDS.low, to: SEVERITY_THRESHOLDS.medium },
  { band: "medium", from: SEVERITY_THRESHOLDS.medium, to: SEVERITY_THRESHOLDS.high },
  { band: "high", from: SEVERITY_THRESHOLDS.high, to: SEVERITY_THRESHOLDS.critical },
  { band: "critical", from: SEVERITY_THRESHOLDS.critical, to: 1 },
];

const cap = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

function Calibration({ series, allTime }: { series: AccuracySeriesExt; allTime?: boolean }) {
  const [ref, W] = useWidth<HTMLDivElement>(620);
  const [hover, setHover] = useState<string | null>(null);
  const { points, empty } = calibrationPoints(series);
  const reading = calibrationReading(points);

  const plotW = Math.max(160, W - M.l - M.r);
  const plotH = H - M.t - M.b;
  const x = (v: number) => M.l + v * plotW;
  const y = (v: number) => M.t + (1 - v) * plotH;
  const radius = (n: number) => 5 + Math.sqrt(n) * 1.6;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  // Label placement: right, left, above, then below each dot — the first spot
  // that stays inside the plot and clears every dot and every label already
  // placed. Text width is estimated (12px Geist ≈ 6.9px per character).
  type Box = [number, number, number, number];
  type Spot = { x: number; y: number; anchor: "start" | "end" | "middle" };
  const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const dotBoxes = points.map((p): Box => {
    const r = radius(p.n);
    return [x(p.mean) - r, y(p.rate) - r, x(p.mean) + r, y(p.rate) + r];
  });
  const placed: Box[] = [];
  const spots = new Map<string, Spot>();
  [...points]
    .sort((a, b) => b.n - a.n)
    .forEach((p) => {
      const cx = x(p.mean);
      const cy = y(p.rate);
      const r = radius(p.n);
      const w = (cap(p.band).length + String(p.addressed).length + String(p.n).length + 2) * 6.9;
      const options: [Spot, Box][] = [
        [{ x: cx + r + 7, y: cy + 4, anchor: "start" }, [cx + r + 5, cy - 9, cx + r + 9 + w, cy + 7]],
        [{ x: cx - r - 7, y: cy + 4, anchor: "end" }, [cx - r - 9 - w, cy - 9, cx - r - 5, cy + 7]],
        [{ x: cx, y: cy - r - 8, anchor: "middle" }, [cx - w / 2 - 2, cy - r - 21, cx + w / 2 + 2, cy - r - 4]],
        [{ x: cx, y: cy + r + 17, anchor: "middle" }, [cx - w / 2 - 2, cy + r + 4, cx + w / 2 + 2, cy + r + 21]],
      ];
      const inside = (b: Box) => b[0] >= M.l - 4 && b[2] <= M.l + plotW + M.r && b[1] >= 0 && b[3] <= M.t + plotH;
      const others = dotBoxes.filter((_, i) => points[i] !== p);
      const free = options.find(([, b]) => inside(b) && !others.some((o) => hit(b, o)) && !placed.some((o) => hit(b, o)));
      const [spot, box] = free ?? options.find(([, b]) => inside(b)) ?? options[0];
      placed.push(box);
      spots.set(p.band, spot);
    });

  const active: CalibrationPoint | undefined = points.find((p) => p.band === hover);

  return (
    <Card tone="surface" pad="lg" className={s.chartCard} as="section" aria-labelledby="acc-cal">
      <SectionHeader
        id="acc-cal"
        title="Does severity predict a fix?"
        description="Each band's mean score against how often its findings were gone on the next run of the same PR."
        actions={allTime ? <Tag tone="outline">All-time</Tag> : undefined}
      />
      <div>
        <div className={s.plotHead} aria-hidden>
          <span>Addressed on a later run</span>
        </div>
        <div className={s.chartBox} ref={ref} onMouseLeave={() => setHover(null)}>
          <svg className={s.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Calibration: mean severity score against addressed rate, per band">
            {ticks.map((t) => (
              <g key={t}>
                <line className={s.gridLine} x1={M.l} x2={M.l + plotW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
                <text className={s.tickText} x={M.l - 10} y={y(t) + 3.5} textAnchor="end">
                  {`${t * 100}%`}
                </text>
                <text className={s.tickText} x={x(t)} y={H - 6} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}>
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            {/* the policy's band scale along the x axis */}
            {BANDS.map((b, i) => (
              <rect
                key={b.band}
                x={x(b.from) + (i ? 1 : 0)}
                y={M.t + plotH + 10}
                width={Math.max(1, x(b.to) - x(b.from) - (i ? 1 : 0) - (i < BANDS.length - 1 ? 1 : 0))}
                height={4}
                rx={2}
                style={{ fill: bandColor(b.band) }}
              />
            ))}
            <line
              x1={x(0)}
              y1={y(0)}
              x2={x(1)}
              y2={y(1)}
              style={{ stroke: "var(--w-line-heavy)" }}
              strokeWidth={1.5}
              strokeDasharray="4 5"
            />
            <line className={s.axisLine} x1={M.l} x2={M.l + plotW} y1={Math.round(y(0)) + 0.5} y2={Math.round(y(0)) + 0.5} />
            {points.map((p) => {
              const cx = x(p.mean);
              const cy = y(p.rate);
              const r = radius(p.n);
              const spot = spots.get(p.band) ?? { x: cx + r + 7, y: cy + 4, anchor: "start" as const };
              return (
                <g
                  key={p.band}
                  className={s.dotHit}
                  tabIndex={0}
                  role="img"
                  aria-label={`${cap(p.band)}: mean score ${ratio(p.mean)}, ${p.addressed} of ${p.n} addressed (${percent(p.rate)}), 95% interval ${percent(p.ci.low)} to ${percent(p.ci.high)}`}
                  onMouseEnter={() => setHover(p.band)}
                  onFocus={() => setHover(p.band)}
                  onBlur={() => setHover(null)}
                  opacity={hover && hover !== p.band ? 0.4 : 1}
                >
                  <line x1={cx} x2={cx} y1={y(p.ci.high)} y2={y(p.ci.low)} style={{ stroke: bandColor(p.band) }} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
                  <line x1={cx - 5} x2={cx + 5} y1={y(p.ci.high)} y2={y(p.ci.high)} style={{ stroke: bandColor(p.band) }} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
                  <line x1={cx - 5} x2={cx + 5} y1={y(p.ci.low)} y2={y(p.ci.low)} style={{ stroke: bandColor(p.band) }} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
                  <circle cx={cx} cy={cy} r={Math.max(r + 8, 14)} fill="transparent" />
                  <circle cx={cx} cy={cy} r={r} style={{ fill: bandColor(p.band), stroke: "var(--w-surface)" }} strokeWidth={2} />
                  <text className={s.dotLabel} x={spot.x} y={spot.y} textAnchor={spot.anchor}>
                    {cap(p.band)} <tspan>{`${p.addressed}/${p.n}`}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
          {active ? (
            <div
              className={s.tip}
              style={{
                left: x(active.mean) > W / 2 ? x(active.mean) - radius(active.n) - 14 : x(active.mean) + radius(active.n) + 14,
                top: Math.max(0, y(active.rate) - 60),
                transform: x(active.mean) > W / 2 ? "translateX(-100%)" : undefined,
              }}
              aria-hidden
            >
              <p className={s.tipTitle}>{cap(active.band)} band</p>
              <div className={s.tipRow}>
                Mean score <b>{ratio(active.mean)}</b>
              </div>
              <div className={s.tipRow}>
                Addressed{" "}
                <b>
                  {active.addressed} of {active.n}
                </b>
              </div>
              <div className={s.tipRow}>
                95% interval{" "}
                <b>
                  {percent(active.ci.low)}–{percent(active.ci.high)}
                </b>
              </div>
              <div className={s.tipRow}>
                Published in band <b>{active.published}</b>
              </div>
            </div>
          ) : null}
        </div>
        <div className={s.plotFoot}>
          <span>
            <i className={s.refKey} aria-hidden /> Score = rate, for reference
          </span>
          <span>Mean severity score in band →</span>
        </div>
      </div>
      <div className={s.reading}>
        {reading.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {empty.length ? <p>{`No data for ${empty.map(cap).join(", ")}: nothing in ${empty.length === 1 ? "that band" : "those bands"} ran twice.`}</p> : null}
      </div>
      <div className={s.srOnly}>
        <table>
        <caption>Calibration per severity band</caption>
        <thead>
          <tr>
            <th scope="col">Band</th>
            <th scope="col">Mean score</th>
            <th scope="col">Addressed</th>
            <th scope="col">n</th>
            <th scope="col">95% interval</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.band}>
              <th scope="row">{p.band}</th>
              <td>{ratio(p.mean)}</td>
              <td>{p.addressed}</td>
              <td>{p.n}</td>
              <td>
                {ratio(p.ci.low)}–{ratio(p.ci.high)}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </Card>
  );
}

function Dismissals({ series, overall, allTime }: { series: AccuracySeriesExt; overall: { k: number; n: number }; allTime?: boolean }) {
  const rows = dismissalRows(series);
  const overallRate = overall.n ? overall.k / overall.n : null;
  const pc = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
  return (
    <Card tone="surface" pad="lg" className={s.chartCard} as="section" aria-labelledby="acc-dismiss">
      <SectionHeader
        id="acc-dismiss"
        title="What reviewers dismiss"
        description="Dismissed ÷ published, per category. The pale band is the 95% interval."
        actions={allTime ? <Tag tone="outline">All-time</Tag> : undefined}
      />
      {rows.length ? (
        <div>
          <ul className={s.dRows}>
            {rows.map((r) => (
              <li
                key={r.category}
                className={s.dRow}
                aria-label={`${humanize(r.category)}: ${r.dismissed} of ${r.published} dismissed (${percent(r.rate)}), 95% interval ${percent(r.ci.low)} to ${percent(r.ci.high)}`}
              >
                <span className={s.dLabel} aria-hidden>
                  {humanize(r.category)}
                </span>
                <span className={s.dTrack} aria-hidden>
                  <span className={s.dBand} style={{ left: pc(r.ci.low), width: pc(r.ci.high - r.ci.low) }} />
                  <span className={s.dBar} style={{ width: pc(r.rate) }} />
                  {overallRate != null ? <span className={s.dRef} style={{ left: pc(overallRate) }} /> : null}
                </span>
                <span className={s.dVal} aria-hidden>
                  <b>{percent(r.rate)}</b>
                  <small>
                    {r.dismissed} of {r.published}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <div className={s.dScale} aria-hidden>
            <span />
            <span>
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </span>
            <span />
          </div>
        </div>
      ) : (
        <p className={s.gateSub}>No published findings in this window.</p>
      )}
      {overallRate != null ? (
        <div className={s.reading}>
          <p>
            {`Across every category, ${overall.k} of ${overall.n} (${percent(overallRate)}), the dashed tick.`}
            {rows[0] && rows[0].rate > overallRate ? ` ${humanize(rows[0].category)} is dismissed most, but on ${rows[0].published} findings.` : ""}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

export function SeverityEvidence({ series, overall, allTime }: { series: AccuracySeriesExt; overall: { k: number; n: number }; allTime?: boolean }) {
  return (
    <div className={s.twoUp}>
      <Calibration series={series} allTime={allTime} />
      <Dismissals series={series} overall={overall} allTime={allTime} />
    </div>
  );
}
