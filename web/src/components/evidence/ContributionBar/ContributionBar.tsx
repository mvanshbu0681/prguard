"use client";
// OWNER: t5 (wave 2). <ContributionBar> — severity as arithmetic (dashboard
// blueprint §3a, landing blueprint §05, design-system §1.6). A bar whose TOTAL
// length is the score, split into the six weighted inputs in their fixed
// SEVERITY_INPUTS order, with the band thresholds printed on the same axis —
// "you can check the arithmetic by eye." Not a radar: a radar encodes by area
// and systematically misrepresents the one number the product's credibility
// rests on.
//
// Same code, same file, three densities (§3a): `glyph` (64×10, findings-list
// row and the fixture manifest's dense listings), `compact` (320px,
// master-detail pane / inline diff card), `detail` (640px, finding detail and
// the marketing instrument-face section). This file renders the instrument
// itself; the caller supplies its own <Exhibit> — or passes `withFrame` to let
// this component wrap itself in one, using the EvidenceFrameProps fields.
//
// Ships on BOTH surfaces, so it imports only engine-free motion primitives
// (@/motion/useSequence, @/motion/tokens, @/motion/reduced) — never gsap, never
// '@/motion/useReplay', never the Motion-library entry ('@/motion/motion'):
// importing Motion here would put it on the same DOM subtree as GSAP wherever
// marketing renders this component (plan §2 hard rule 2).
import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { bandForScore as badgeBandForScore, formatScore, useStamp } from "@/components/badges";
import { Sigma } from "@/components/icons";
import { SEVERITY_THRESHOLDS, type SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { DUR, STAGGER } from "@/motion/tokens";
import { useSequence } from "@/motion/useSequence";
import { Exhibit } from "@/components/chrome";
import type { ContributionBarProps as FrozenProps } from "../props";
import {
  bandRuleText,
  contributionPercent,
  contributionRows,
  explanationClauses,
  readoutSnapMs,
  segmentSchedule,
  tickForBand,
  SEGMENT_MIN_PX,
  TICKS,
  TICK_LABEL,
  type SeverityInputName,
} from "./geometry";
import { BAND_FILL_CLASS, BAND_TEXT_CLASS, PROOF_CONFIDENCE_HATCH, segmentColor, segmentColorHover } from "./ramp";

// ---------------------------------------------------------------------------
// Props — props.ts's ContributionBarProps is frozen (owner t1a). Two fields
// this component needs are missing from it, so they are added here, locally,
// per plan §5's rule ("a wave-2 builder blocked on a missing field adds it to
// their own local type and files it") — both are reported under `raised`:
//
//   notes      FindingSeverity.notes — the disproven clamp note ("clamped to
//              info: repro passed at head"), printed honestly rather than
//              silently rendering a clean bar for a self-refuted finding.
//   withFrame  The brief's own instruction: "you render the instrument,
//              optionally with a withFrame prop that wraps it in Exhibit."
// ---------------------------------------------------------------------------

export interface ContributionBarProps extends FrozenProps {
  /** FindingSeverity.notes — printed beneath the bar (§3a "DISPROVEN findings"). Local extension, see above. */
  notes?: string[];
  /** Wrap the instrument in <Exhibit>, using this component's EvidenceFrameProps fields as its header/footer. Ignored at density="glyph". Local extension, see above. */
  withFrame?: boolean;
  /** Skip the once-per-mount entrance (e.g. a lab specimen sheet showing many bars at rest). Default false. */
  disableEntrance?: boolean;
  className?: string;
}

const TRACK_HEIGHT: Record<"compact" | "detail", number> = { compact: 18, detail: 28 };
const TRACK_MAX_WIDTH: Record<"compact" | "detail", number> = { compact: 320, detail: 640 };
const READOUT_CLASS: Record<"compact" | "detail", string> = { compact: "type-readout", detail: "type-readout-xl" };

/** §3a's short form for the inline label row and density="compact" (worked example: "blast", "coverage", "proof_conf"). */
const SHORT_LABEL: Record<SeverityInputName, string> = {
  path_sensitivity: "path_sens",
  reachability: "reachability",
  blast_radius: "blast",
  coverage_gap: "coverage",
  proof_confidence: "proof_conf",
  churn: "churn",
};

function segId(prefix: string, name: string): string {
  return `${prefix}-seg-${name}`;
}

export function ContributionBar(props: ContributionBarProps) {
  if (props.density === "glyph") return <ContributionBarGlyph {...props} />;
  return <ContributionBarInstrument {...props} density={props.density} />;
}

// ---------------------------------------------------------------------------
// glyph — 64×10, six segments, no ticks/labels/hatch, static (never animates:
// it rides in dense findings-list rows, motion §4.8.1's own sparkline rule).
// ---------------------------------------------------------------------------

function ContributionBarGlyph({ score, inputs, weights, band, className }: ContributionBarProps) {
  const rows = useMemo(() => contributionRows(inputs, weights), [inputs, weights]);
  const resolvedBand = band ?? badgeBandForScore(score);
  const reading = formatScore(score);
  return (
    <span role="img" aria-label={`severity ${reading}, ${resolvedBand}`} className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <span aria-hidden className="inline-flex h-[10px] w-[64px] shrink-0 overflow-hidden rounded-xs border border-rule-1 bg-ink-2">
        {rows.map((row, i) => (
          <span
            key={row.name}
            data-input={row.name}
            className={cn("h-full shrink-0", i < rows.length - 1 && "border-r border-r-ink-1")}
            style={{ width: `max(${contributionPercent(row).toFixed(4)}%, 2px)`, backgroundColor: segmentColor(i, rows.length) }}
          />
        ))}
      </span>
      <span aria-hidden className={cn("type-label -me-[0.12em]", BAND_TEXT_CLASS[resolvedBand])}>
        {resolvedBand === "info" ? "I" : resolvedBand === "low" ? "L" : resolvedBand === "medium" ? "M" : resolvedBand === "high" ? "H" : "C"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// compact / detail — the interactive instrument.
// ---------------------------------------------------------------------------

function ContributionBarInstrument({
  score,
  inputs,
  weights,
  density,
  band,
  explanation,
  findingId,
  notes,
  withFrame,
  disableEntrance,
  index,
  provenance,
  capturedAt,
  ext,
  className,
}: ContributionBarProps & { density: "compact" | "detail" }) {
  const uid = useId();
  const rows = useMemo(() => contributionRows(inputs, weights), [inputs, weights]);
  const resolvedBand: SeverityBand = band ?? badgeBandForScore(score);
  const reading = formatScore(score);
  const tick = tickForBand(resolvedBand);
  const clauses = useMemo(() => explanationClauses(explanation, rows), [explanation, rows]);

  // Active input, from either the pointer or the keyboard — "arrow keys move
  // between segments with the same effect" as hover (§3a).
  const [hoverName, setHoverName] = useState<SeverityInputName | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const activeIndex = hoverName ? rows.findIndex((r) => r.name === hoverName) : focusIndex;
  const activeName = activeIndex !== null && activeIndex >= 0 ? rows[activeIndex]!.name : null;

  // Entrance (§4.8.1, brand-gaps §2 rulings 4 & 7): 420ms total on both
  // surfaces, six segments STAGGER.sibling (60ms) apart. Rest state (before
  // any play) is the full bar — "the DOM is whatever the server rendered,
  // which must already be the end state."
  const animates = !disableEntrance;
  const schedule = useMemo(() => segmentSchedule(rows.length, DUR.enter, STAGGER.sibling), [rows.length]);
  const snapAt = useMemo(() => readoutSnapMs(rows, tick, schedule), [rows, tick, schedule]);
  const [grownCount, setGrownCount] = useState(rows.length);
  const [readoutRevealed, setReadoutRevealed] = useState(true);
  const steps = useMemo(() => {
    if (!animates) return [];
    const segmentSteps = schedule.map((s, i) => ({ at: s.startMs, apply: () => setGrownCount(i + 1), label: `segment ${i}` }));
    return [...segmentSteps, { at: snapAt, apply: () => setReadoutRevealed(true), label: "readout" }].sort((a, b) => a.at - b.at);
  }, [animates, schedule, snapAt]);
  // Destructured (not `const seq = useSequence(...)`): the React Compiler lint
  // otherwise treats the whole return value as a ref because `.ref` flows into
  // a `ref=` prop, and flags every other `seq.x` read (useSequence.ts's own doc).
  const { ref: entranceRef } = useSequence<HTMLDivElement>(steps, {
    autoplay: animates ? "in-view" : "none",
    reset: () => {
      setGrownCount(0);
      setReadoutRevealed(false);
    },
  });
  const readoutStamps = useStamp(readoutRevealed);

  const trackWidth = TRACK_MAX_WIDTH[density];
  const trackHeight = TRACK_HEIGHT[density];

  function moveFocus(next: number | null) {
    setFocusIndex(next);
    setHoverName(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const n = rows.length;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(focusIndex === null ? 0 : Math.min(n - 1, focusIndex + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(focusIndex === null ? n - 1 : Math.max(0, focusIndex - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(n - 1);
    }
  }

  const groupLabel = `severity ${reading}, ${resolvedBand} — six weighted inputs, arrow keys to inspect each`;
  const activeRow = activeName ? rows.find((r) => r.name === activeName) : null;
  const liveText = activeRow ? `${activeRow.name.replaceAll("_", " ")}: raw ${formatScore(activeRow.raw)}, weight ${activeRow.weight.toFixed(2)}, contribution ${formatScore(activeRow.contribution)}` : "";

  const instrument = (
    // min-w-0: a flex or grid ancestor otherwise refuses to shrink this below the
    // table's content width, which would push the WHOLE ancestor track wider than
    // the viewport instead of the table's own overflow-x-auto taking the scroll.
    <div ref={entranceRef} className={cn("w-full min-w-0", className)} style={{ maxWidth: trackWidth }}>
      {/* Readout — snaps, never counts up (§2.5, §4.8.1). */}
      <div
        className={cn("flex items-baseline gap-3", readoutStamps > 0 && "stamp")}
        style={{ opacity: readoutRevealed ? 1 : 0, transition: "none" }}
      >
        <span className={cn(READOUT_CLASS[density], "text-text-primary")} data-slot="contribution-bar-score">
          {reading}
        </span>
        <span className={cn("type-label -me-[0.12em]", BAND_TEXT_CLASS[resolvedBand])}>{resolvedBand.toUpperCase()}</span>
      </div>

      {notes && notes.length > 0 ? (
        <p className="mt-1 type-data text-text-dim">
          {notes.map((n, i) => (
            <span key={i}>
              {i > 0 ? " · " : null}
              {n}
            </span>
          ))}
        </p>
      ) : null}

      {/* Track + ticks */}
      <div className="relative mt-4" style={{ paddingBottom: 20 }}>
        <div
          role="group"
          tabIndex={0}
          aria-label={groupLabel}
          aria-activedescendant={activeIndex !== null && activeIndex >= 0 ? segId(uid, rows[activeIndex]!.name) : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setFocusIndex(null)}
          onPointerLeave={() => setHoverName(null)}
          className="relative flex overflow-hidden rounded-xs border border-rule-1 bg-ink-2 outline-offset-2"
          style={{ height: trackHeight }}
        >
          {rows.map((row, i) => {
            const active = row.name === activeName;
            const base = active ? segmentColorHover(i, rows.length) : segmentColor(i, rows.length);
            const grown = !animates || i < grownCount;
            const style: CSSProperties = {
              width: `max(${contributionPercent(row).toFixed(4)}%, ${SEGMENT_MIN_PX}px)`,
            };
            const fillStyle: CSSProperties = {
              backgroundColor: base,
              backgroundImage: row.name === "proof_confidence" ? PROOF_CONFIDENCE_HATCH : undefined,
              transform: `scaleX(${grown ? 1 : 0})`,
              transformOrigin: "left",
              transition: `background-color ${DUR.hover}ms var(--ease-snap), transform ${schedule[i]?.durationMs ?? DUR.hover}ms var(--ease-instrument)`,
            };
            return (
              <div
                key={row.name}
                id={segId(uid, row.name)}
                role="img"
                aria-label={`${row.name.replaceAll("_", " ")} ${formatScore(row.raw)} × ${row.weight.toFixed(2)} = ${formatScore(row.contribution)}`}
                data-input={row.name}
                data-active={active ? "" : undefined}
                className={cn("relative h-full shrink-0", i < rows.length - 1 && "border-r border-r-ink-1")}
                style={style}
                onPointerEnter={() => setHoverName(row.name)}
              >
                <div className="absolute inset-0" style={fillStyle} />
              </div>
            );
          })}
        </div>

        {TICKS.map((key) => {
          const promoted = tick === key;
          const left = SEVERITY_THRESHOLDS[key] * 100;
          return (
            <div key={key} aria-hidden data-tick={key} data-promoted={promoted ? "" : undefined} className="absolute top-0" style={{ left: `${left}%`, height: trackHeight + 6 }}>
              <div
                className={cn("h-full", promoted ? BAND_FILL_CLASS[resolvedBand] : "bg-ink-6")}
                style={{ width: promoted ? 2 : 1, marginLeft: promoted ? -1 : 0 }}
              />
              <span
                className={cn("absolute top-full mt-1 type-label whitespace-nowrap", promoted ? BAND_TEXT_CLASS[resolvedBand] : "text-text-dim")}
                style={{ transform: "translateX(-50%)" }}
              >
                {TICK_LABEL[key]}
              </span>
            </div>
          );
        })}

        <span className="sr-only" aria-live="polite">
          {liveText}
        </span>
      </div>

      {/* Input labels + contributions — the short form (§3a worked example). */}
      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 type-data text-text-body">
        {rows.map((row) => (
          <div key={row.name} className={cn("flex items-baseline gap-1", row.name === activeName && "text-text-primary")}>
            <dt className="text-text-dim">{SHORT_LABEL[row.name]}</dt>
            <dd className="tabular">{formatScore(row.contribution)}</dd>
          </div>
        ))}
      </dl>

      {explanation ? (
        <p className="mt-3 type-data text-text-primary">
          &ldquo;
          {clauses.map((clause, i) => (
            <span key={i}>
              {i > 0 ? " × " : null}
              <span className={clause.input && clause.input === activeName ? "underline decoration-1 underline-offset-2" : undefined}>{clause.text}</span>
            </span>
          ))}
          &rdquo;
        </p>
      ) : null}

      {density === "detail" ? (
        <>
          {/* Below 640px: six stacked blocks, "input / raw × weight = contribution"
              on two lines each (landing §05 mobile) — a four-column table has no
              readable width left once "coverage_gap"/"proof_confidence" fit at all. */}
          <dl className="mt-4 grid gap-3 sm:hidden">
            {rows.map((row) => (
              <div key={row.name} data-mobile-row-input={row.name} className={cn("border-b border-rule-hair pb-2 last:border-b-0", row.name === activeName && "bg-ink-3")}>
                <dt className="type-label text-text-dim">{row.name}</dt>
                <dd className="tabular">
                  {formatScore(row.raw)} × {row.weight.toFixed(2)} = <span className="text-text-primary">{formatScore(row.contribution)}</span>
                </dd>
              </div>
            ))}
            <div className="flex items-baseline gap-2 pt-1 tabular text-text-primary">
              <Sigma />
              <span>{reading}</span>
              <span className="text-text-dim">{bandRuleText(resolvedBand, score)}</span>
            </div>
          </dl>

          {/* overflow-x-auto: a table's columns refuse to shrink below their content's
              natural width even inside a `w-full` parent, so at 640px+ (where the row
              headers have room) this scrolls its own axis rather than the page's. */}
          <div className="mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[420px] border-collapse type-data text-text-body">
            <caption className="sr-only">Severity contribution table for finding {findingId ?? "unknown"}</caption>
            <thead>
              <tr className="border-b border-rule-1 text-text-dim">
                <th scope="col" className="py-1.5 pr-3 text-left font-normal type-label">
                  input
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal type-label">
                  raw
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-normal type-label">
                  weight
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-normal type-label">
                  contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} data-row-input={row.name} className={cn("border-b border-rule-hair", row.name === activeName && "bg-ink-3")}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {row.name}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular">{formatScore(row.raw)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{row.weight.toFixed(2)}</td>
                  <td className="py-1.5 pl-3 text-right tabular">{formatScore(row.contribution)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-rule-1">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  <Sigma />
                </th>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="py-1.5 pl-3 text-right tabular text-text-primary">
                  {reading} <span className="text-text-dim">{bandRuleText(resolvedBand, score)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      ) : null}
    </div>
  );

  if (!withFrame) return instrument;

  const idx = index ?? "05";
  const cat = "COMPUTED SEVERITY";
  const ident: ReactNode = findingId ? `finding ${findingId.slice(0, 8)}` : undefined;
  const prov = provenance ?? (findingId ? `GET /v1/findings/${findingId} → severity.inputs · severity.weights · severity.explanation` : "severity.inputs · severity.weights · severity.explanation");
  return (
    <Exhibit index={idx} category={cat} identifier={ident} provenance={prov} capturedAt={capturedAt} ext={ext} radius={density === "detail" ? "container" : "panel"}>
      {instrument}
    </Exhibit>
  );
}
