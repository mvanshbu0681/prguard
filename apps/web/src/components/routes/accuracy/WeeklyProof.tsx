"use client";
// Proof outcomes week by week: one rounded stacked column per week, six
// proof states in a fixed order (colour follows the state, never its rank),
// 2px surface gaps between segments, a count/share toggle and a legend rail
// that doubles as the window's totals. Hover or focus a week for its
// breakdown; a visually hidden table carries every value for assistive tech.
import { useMemo, useState } from "react";
import { Card, PROOF_ENCODING, SectionHeader, Segmented, Tag } from "@/components/dash/kit";
import { shortDate } from "@/components/dash/format";
import type { AccuracySeriesExt } from "@/components/charts";
import { cn } from "@/lib/utils";
import { niceScale, percent } from "./derive";

const PROOF_KEYS = PROOF_ENCODING;
import { useWidth } from "./use-width";
import s from "./accuracy.module.css";

type Mode = "count" | "share";

const H = 272;
const M = { t: 24, r: 4, b: 30, l: 34 };
const GAP = 2;
const R = 5;

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`;
}

export function WeeklyProof({ weekly, allTime }: { weekly: AccuracySeriesExt["weekly"]; allTime?: boolean }) {
  const [mode, setMode] = useState<Mode>("count");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>(720);

  const totals = useMemo(() => weekly.map((w) => PROOF_KEYS.reduce((a, k) => a + (w[k.key] ?? 0), 0)), [weekly]);
  const windowTotals = useMemo(() => PROOF_KEYS.map((k) => weekly.reduce((a, w) => a + (w[k.key] ?? 0), 0)), [weekly]);
  const grand = windowTotals.reduce((a, b) => a + b, 0);
  const attempted = windowTotals.slice(0, 4).reduce((a, b) => a + b, 0);

  const plotW = Math.max(120, W - M.l - M.r);
  const plotH = H - M.t - M.b;
  const scale = mode === "count" ? niceScale(Math.max(...totals, 1)) : { max: 1, step: 0.25 };
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, i) => i * scale.step);
  const y = (v: number) => M.t + plotH * (1 - v / scale.max);
  const band = plotW / Math.max(1, weekly.length);
  const bw = Math.min(36, Math.max(12, band * 0.46));

  const cols = weekly.map((w, i) => {
    const total = totals[i];
    const x = M.l + band * i + (band - bw) / 2;
    let cum = 0;
    let drawn = 0;
    const nonZero = PROOF_KEYS.filter((k) => (w[k.key] ?? 0) > 0);
    const top = nonZero.at(-1)?.key;
    const segs = PROOF_KEYS.flatMap((k) => {
      const raw = w[k.key] ?? 0;
      if (raw <= 0) return [];
      const v = mode === "share" ? raw / (total || 1) : raw;
      const yTop = y(cum + v);
      let yBot = y(cum);
      if (drawn > 0) yBot -= GAP;
      cum += v;
      drawn += 1;
      const h = Math.max(1, yBot - yTop);
      return [{ key: k.key, color: k.color, x, yTop, h, isTop: k.key === top }];
    });
    return { w, i, x, total, colTop: y(cum), segs };
  });

  const active = hover == null ? null : cols[hover];
  const tipLeft = active ? (active.x + bw / 2 > W / 2 ? active.x - 12 : active.x + bw + 12) : 0;
  const tipFlip = active ? active.x + bw / 2 > W / 2 : false;

  return (
    <Card tone="surface" pad="lg" className={s.chartCard} as="section" aria-labelledby="acc-weekly">
      <SectionHeader
        id="acc-weekly"
        title="Proof outcomes, week by week"
        description="Every scored finding, by what happened when Witness tried to prove it."
        actions={
          <>
          {allTime ? <Tag tone="outline">All-time</Tag> : null}
          <Segmented<Mode>
            size="sm"
            label="Show counts or shares"
            value={mode}
            onChange={setMode}
            options={[
              { value: "count", label: "Count" },
              { value: "share", label: "Share" },
            ]}
          />
          </>
        }
      />
      <div className={s.weekly}>
        <div className={s.chartBox} ref={ref} onMouseLeave={() => setHover(null)}>
          <svg
            className={s.svg}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label={`Proof outcomes per week, ${mode === "count" ? "counts" : "shares"}`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className={s.gridLine} x1={M.l} x2={M.l + plotW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
                <text className={s.tickText} x={M.l - 10} y={y(t) + 3.5} textAnchor="end">
                  {mode === "share" ? `${Math.round(t * 100)}%` : t}
                </text>
              </g>
            ))}
            {cols.map((c) => {
              const provenShare = c.total ? (c.w.proven ?? 0) / c.total : 0;
              const aria = `Week of ${shortDate(c.w.week_start)}: ${PROOF_KEYS.map((k) => `${c.w[k.key] ?? 0} ${k.label.toLowerCase()}`).join(", ")}`;
              return (
                <g
                  key={c.w.week_start}
                  className={s.col}
                  data-dim={hover != null && hover !== c.i ? "" : undefined}
                  tabIndex={0}
                  role="img"
                  aria-label={aria}
                  onMouseEnter={() => setHover(c.i)}
                  onFocus={() => setHover(c.i)}
                  onBlur={() => setHover(null)}
                >
                  <rect className={s.colHit} x={M.l + band * c.i + 2} y={M.t - 16} width={band - 4} height={plotH + 16} rx={10} />
                  {c.segs.map((g) =>
                    g.isTop ? (
                      <path key={g.key} d={topRounded(g.x, g.yTop, bw, g.h, R)} style={{ fill: g.color }} />
                    ) : (
                      <rect key={g.key} x={g.x} y={g.yTop} width={bw} height={g.h} style={{ fill: g.color }} />
                    ),
                  )}
                  <text className={s.valueText} x={c.x + bw / 2} y={c.colTop - 8} textAnchor="middle">
                    {mode === "count" ? c.total : percent(provenShare)}
                  </text>
                  <text className={s.tickText} x={c.x + bw / 2} y={H - 8} textAnchor="middle">
                    {shortDate(c.w.week_start)}
                  </text>
                </g>
              );
            })}
            <line className={s.axisLine} x1={M.l} x2={M.l + plotW} y1={Math.round(y(0)) + 0.5} y2={Math.round(y(0)) + 0.5} />
          </svg>
          {active ? (
            <div className={s.tip} style={{ left: tipLeft, top: M.t, transform: tipFlip ? "translateX(-100%)" : undefined }} aria-hidden>
              <p className={s.tipTitle}>Week of {shortDate(active.w.week_start)}</p>
              {[...PROOF_KEYS].reverse().map((k) => {
                const v = active.w[k.key] ?? 0;
                return (
                  <div key={k.key} className={s.tipRow}>
                    <i className={s.swatch} style={{ background: k.color }} />
                    {k.label}
                    <b>{v}</b>
                    <small>{active.total ? percent(v / active.total) : "—"}</small>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div>
          <p className={s.railHead}>
            <b>{windowTotals[0]}</b> of <b>{grand}</b> scored findings were proven; <b>{attempted}</b> had a proof attempted.
          </p>
          <ul className={s.rail} aria-label="Legend and window totals">
            {[...PROOF_KEYS].reverse().map((k) => {
              const idx = PROOF_KEYS.findIndex((x) => x.key === k.key);
              const v = windowTotals[idx];
              return (
                <li key={k.key} className={cn(s.railItem)}>
                  <i className={s.swatch} style={{ background: k.color }} />
                  {k.label}
                  <b>{v}</b>
                  <small>{grand ? percent(v / grand) : "—"}</small>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className={s.srOnly}>
        <table>
        <caption>Proof outcomes per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            {PROOF_KEYS.map((k) => (
              <th key={k.key} scope="col">
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weekly.map((w) => (
            <tr key={w.week_start}>
              <th scope="row">{w.week_start}</th>
              {PROOF_KEYS.map((k) => (
                <td key={k.key}>{w[k.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </Card>
  );
}
