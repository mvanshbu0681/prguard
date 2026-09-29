"use client";
// The policy page's bespoke controls. Each is a native input underneath (a
// range, a button group with radio semantics) so keyboard and assistive tech
// get the real thing; the visuals are drawn on the policy's own band scale.
import type { LucideIcon } from "lucide-react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { IconButton, bandColor } from "@/components/dash/kit";
import { SEVERITY_BANDS as BAND_ORDER, type SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import type { Thresholds } from "./policy-model";
import s from "./policy.module.css";

const cap = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

/* ---------------------------------------------------------------------------
   Rows
   --------------------------------------------------------------------------- */

export function SettingRow({
  label,
  hint,
  envKey,
  changed,
  wide,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  envKey?: string;
  changed?: boolean;
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(s.row, wide && s.rowWide, className)}>
      <div className={s.rowText}>
        <p className={s.rowLabel}>
          {changed ? <span className={s.changed} title="Changed in this draft" aria-label="changed" /> : null}
          {label}
        </p>
        {hint ? <p className={s.rowHint}>{hint}</p> : null}
        {envKey ? <p className={s.rowKey}>{envKey}</p> : null}
      </div>
      {children != null ? <div className={s.rowControl}>{children}</div> : null}
    </div>
  );
}

/** A rule that is not a setting: stated, with a lock, so nobody hunts for the switch. */
export function Locked({ children = "Fixed" }: { children?: ReactNode }) {
  return (
    <span className={s.locked}>
      <Lock size={12} strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Block-at: a five-stop slider drawn as the band scale
   --------------------------------------------------------------------------- */

export function BandPicker({ value, onChange }: { value: SeverityBand; onChange: (b: SeverityBand) => void }) {
  const rank = BAND_ORDER.indexOf(value);
  return (
    <div className={s.bp}>
      <div className={s.bpRail} aria-hidden>
        {BAND_ORDER.map((b, i) => (
          <span key={b} data-on={i >= rank ? "" : undefined} style={{ ["--c" as string]: bandColor(b) }} />
        ))}
      </div>
      <input
        className={s.bpRange}
        type="range"
        min={0}
        max={BAND_ORDER.length - 1}
        step={1}
        value={rank}
        aria-label="Block merges from this band up"
        aria-valuetext={`${cap(value)} and above`}
        onChange={(e) => onChange(BAND_ORDER[Number(e.target.value)])}
      />
      <div className={s.bpLabels} aria-hidden>
        {BAND_ORDER.map((b, i) => (
          <button key={b} type="button" tabIndex={-1} data-on={i >= rank ? "" : undefined} data-at={i === rank ? "" : undefined} onClick={() => onChange(b)}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The shared 0–1 band scale, with one or more thumbs on it
   --------------------------------------------------------------------------- */

export interface ScaleThumb {
  id: string;
  value: number;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  /** Visible value text over the thumb. */
  text?: string;
}

export function BandScale({
  thresholds,
  thumbs,
  highlightFrom,
  caption,
}: {
  thresholds: Thresholds;
  thumbs: ScaleThumb[];
  /** Dim the scale below this score (e.g. what qualifies for a proof). */
  highlightFrom?: number;
  caption?: ReactNode;
}) {
  const segs: { band: SeverityBand; from: number; to: number }[] = [
    { band: "info", from: 0, to: thresholds.low },
    { band: "low", from: thresholds.low, to: thresholds.medium },
    { band: "medium", from: thresholds.medium, to: thresholds.high },
    { band: "high", from: thresholds.high, to: thresholds.critical },
    { band: "critical", from: thresholds.critical, to: 1 },
  ];
  const at = (v: number): CSSProperties => ({ ["--v" as string]: String(Math.max(0, Math.min(1, v))) });
  return (
    <div className={s.scale}>
      <div className={s.scaleValues} aria-hidden>
        {thumbs.map((t) => (
          <span key={t.id} style={at(t.value)}>
            {t.text ?? t.value.toFixed(2)}
          </span>
        ))}
      </div>
      <div className={s.scaleTrack} aria-hidden>
        {segs.map((g) => (
          <span
            key={g.band}
            data-dim={highlightFrom != null && g.to <= highlightFrom + 1e-9 ? "" : undefined}
            style={{ left: `${g.from * 100}%`, width: `${Math.max(0, g.to - g.from) * 100}%`, ["--c" as string]: bandColor(g.band) }}
          />
        ))}
        {highlightFrom != null ? <span className={s.scaleShade} style={{ width: `${highlightFrom * 100}%` }} /> : null}
      </div>
      {thumbs.map((t) => (
        <input
          key={t.id}
          className={s.scaleRange}
          type="range"
          min={0}
          max={1}
          step={t.step ?? 0.01}
          value={t.value}
          aria-label={t.label}
          aria-valuetext={t.value.toFixed(2)}
          onChange={(e) => {
            const v = Number(e.target.value);
            const lo = t.min ?? 0;
            const hi = t.max ?? 1;
            t.onChange(Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100);
          }}
        />
      ))}
      <div className={s.scaleNames} aria-hidden>
        {segs.map((g) => (
          <span key={g.band} style={{ left: `${((g.from + g.to) / 2) * 100}%` }} data-narrow={g.to - g.from < 0.1 ? "" : undefined}>
            {g.band}
          </span>
        ))}
      </div>
      {caption ? <p className={s.scaleCaption}>{caption}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   A weight slider
   --------------------------------------------------------------------------- */

export function WeightSlider({ value, label, onChange, max = 0.5 }: { value: number; label: string; onChange: (v: number) => void; max?: number }) {
  const p = Math.max(0, Math.min(1, value / max));
  return (
    <input
      className={s.weight}
      type="range"
      min={0}
      max={max}
      step={0.01}
      value={value}
      aria-label={label}
      aria-valuetext={value.toFixed(2)}
      style={{ ["--p" as string]: `${p * 100}%` }}
      onChange={(e) => onChange(Math.round(Number(e.target.value) * 100) / 100)}
    />
  );
}

/* ---------------------------------------------------------------------------
   A stepper pill
   --------------------------------------------------------------------------- */

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <IconButton icon={Minus} label={`Decrease ${label.toLowerCase()}`} size="sm" disabled={value <= min} onClick={() => onChange(clamp(value - step))} />
      <output className={s.stepValue} aria-live="polite">
        {value}
        {unit ? <small>{unit}</small> : null}
      </output>
      <IconButton icon={Plus} label={`Increase ${label.toLowerCase()}`} size="sm" disabled={value >= max} onClick={() => onChange(clamp(value + step))} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Options as cards (radio semantics)
   --------------------------------------------------------------------------- */

export interface CardOption<T extends string> {
  value: T;
  title: string;
  body: string;
  icon: LucideIcon;
  meta?: string;
}

export function OptionCards<T extends string>({ options, value, onChange, label }: { options: CardOption<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className={s.options} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        const Glyph = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={s.option}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(options[(i + 1) % options.length].value);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(options[(i - 1 + options.length) % options.length].value);
              }
            }}
            tabIndex={on ? 0 : -1}
          >
            <span className={s.optionHead}>
              <span className={s.optionIcon} aria-hidden>
                <Glyph size={16} strokeWidth={1.9} />
              </span>
              <span className={s.optionCheck} aria-hidden>
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>
            </span>
            <span className={s.optionTitle}>{o.title}</span>
            <span className={s.optionBody}>{o.body}</span>
            {o.meta ? <span className={s.optionMeta}>{o.meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
