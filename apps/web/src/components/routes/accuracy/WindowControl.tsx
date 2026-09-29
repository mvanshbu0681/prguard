"use client";
// The report window: quick presets (All / 30 days / 7 days) and a custom
// range as two pill fields. Each pill shows the date in the dashboard's own
// format ("17 Aug"); the native date input underneath stays the accessible,
// labelled control ("Since" / "Until") and opens its picker on click. Presets
// count whole UTC days back from "now", which in fixture mode is the frozen
// corpus instant. Everything writes the same ?since / ?until URL params.
// An inverted range (From after To) is refused inline and never written; one
// that arrives in the URL is flagged here and ignored by the route.
import { ArrowRight, RotateCcw, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Segmented } from "@/components/dash/kit";
import { CORPUS_NOW, shortDate } from "@/components/dash/format";
import { FIXTURES } from "@/lib/env";
import { WINDOW_PRESETS, activePreset, daysBefore, type PresetId } from "./derive";
import { toDateInputValue, useAccuracyWindowFilter } from "./window-filter";
import s from "./accuracy.module.css";

const toDate = (v: string) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const now = () => (FIXTURES ? CORPUS_NOW : Date.now());

function DatePill({
  label,
  aria,
  value,
  empty,
  min,
  max,
  invalid,
  describedBy,
  onChange,
}: {
  label: string;
  aria: string;
  value: Date | null;
  empty: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (d: Date | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label
      className={s.datePill}
      data-set={value ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      onClick={() => {
        try {
          ref.current?.showPicker?.();
        } catch {
          /* picker already open, or unsupported: the input still takes typing */
        }
      }}
    >
      <span className={s.dateLabel}>{label}</span>
      <span className={s.dateValue} aria-hidden>
        {value ? shortDate(value.toISOString()) : empty}
      </span>
      <input
        ref={ref}
        className={s.dateInput}
        type="date"
        aria-label={aria}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        value={toDateInputValue(value)}
        min={min}
        max={max}
        onChange={(e) => onChange(toDate(e.target.value))}
      />
    </label>
  );
}

export function WindowControl() {
  const [{ since, until }, setWindow] = useAccuracyWindowFilter();
  const [refused, setRefused] = useState<string | null>(null);
  const inverted = since != null && until != null && since.getTime() > until.getTime();
  const preset = inverted ? "custom" : activePreset(since, until, now());
  const message = refused ?? (inverted ? `This window ends (${shortDate(until!.toISOString())}) before it starts (${shortDate(since!.toISOString())}), so it isn't applied.` : null);
  const setSince = (d: Date | null) => {
    if (d && until && d.getTime() > until.getTime()) {
      setRefused(`From can't be after To (${shortDate(until.toISOString())}). Not applied.`);
      return;
    }
    setRefused(null);
    setWindow({ since: d });
  };
  const setUntil = (d: Date | null) => {
    if (d && since && d.getTime() < since.getTime()) {
      setRefused(`To can't be before From (${shortDate(since.toISOString())}). Not applied.`);
      return;
    }
    setRefused(null);
    setWindow({ until: d });
  };
  return (
    <form className={s.window} onSubmit={(e) => e.preventDefault()} aria-label="Accuracy report window">
      <Segmented<PresetId>
        size="sm"
        label="Report window"
        value={preset}
        onChange={(id) => {
          setRefused(null);
          if (id === "all") setWindow({ since: null, until: null });
          const p = WINDOW_PRESETS.find((x) => x.id === id);
          if (p) setWindow({ since: daysBefore(now(), p.days), until: null });
        }}
        options={[{ value: "all", label: "All" }, ...WINDOW_PRESETS.map((p) => ({ value: p.id as PresetId, label: p.label }))]}
      />
      <span className={s.dates} data-custom={preset === "custom" ? "" : undefined}>
        <DatePill
          label="From"
          aria="Since"
          value={since}
          empty="first run"
          max={toDateInputValue(until) || undefined}
          invalid={Boolean(message)}
          describedBy="acc-window-error"
          onChange={setSince}
        />
        <ArrowRight size={13} strokeWidth={1.8} className={s.dateArrow} aria-hidden />
        <DatePill
          label="To"
          aria="Until"
          value={until}
          empty="now"
          min={toDateInputValue(since) || undefined}
          invalid={Boolean(message)}
          describedBy="acc-window-error"
          onChange={setUntil}
        />
      </span>
      {since || until ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={() => {
            setRefused(null);
            setWindow({ since: null, until: null });
          }}
        >
          Clear
        </Button>
      ) : null}
      {message ? (
        <p className={s.winError} id="acc-window-error" role="alert">
          <TriangleAlert size={13} strokeWidth={2} aria-hidden />
          {message}
        </p>
      ) : null}
    </form>
  );
}
