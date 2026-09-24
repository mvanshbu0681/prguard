"use client";
// OWNER: t7 (wave 2). <StageRail> — the nine-stage pipeline, live and replayed (plan §13
// T7; landing-blueprint §06; dashboard-blueprint §2.4, §5.1; design-system §1.11, §8.4;
// motion-spec §4.7, §4.9).
//
// Geometry is read-only from @/lib/pipeline-geometry (this file's one dependency for shape);
// everything ELSE — state, paint, interaction — lives here.
//
//   <StageRail
//     mode="live" orientation="horizontal"
//     stages={stageStatesFromReviewStatus(status)}       the dashboard maps ReviewStatus itself
//     stageIndex={status.stage_index} secondsSinceHeartbeat={status.seconds_since_heartbeat}
//     stageLabels={labels} expectedMs={p50s} gate={result?.gate?.conclusion}
//     provenance="GET /v1/reviews/4e8b1d0 → stage_index · stage_total · stage_label · heartbeat"
//   />
//
//   <StageRail mode="replay" orientation="horizontal" stages={ALL_DONE}
//     durationsMs={demoRun.stages} stageLabels={demoRunLabels} gate="success" onPlay={...} />
//
//   <StageRail mode="static" orientation="vertical" stages={fixedStages} />
//
// `stages` is the single source of truth for `static` and `live` (props.ts, plan §5: "the
// dashboard maps stage_index/status into states" — the caller does that mapping, this
// component only paints it; ./state.ts's stageStatesFromReviewStatus is exported for that
// caller, not used internally). `replay` computes its OWN nine states from `durationsMs`
// via useSequence and ignores `stages` for anything but its rest-frame (see below).
//
// Registration marks: only through <Exhibit>, only when `provenance` is given (plan §2 rule
// 1) — pass it and this renders its own evidence frame; omit it to get the bare diagram for
// a caller that frames it itself.
import { useCallback, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Exhibit } from "@/components/chrome";
import { GateBlock, STAGE_DOT_COLOR } from "@/components/badges";
import { Play, StageGlyph } from "@/components/icons";
import type { EvidenceFrameProps } from "../props";
import { heartbeatLabel, heartbeatProps } from "@/motion/heartbeat";
import { useSequence, type SequenceStep } from "@/motion/useSequence";
import { STAGES, type GateConclusion, type Stage, type StageState } from "@/lib/contracts";
import { asPercent, PIPELINE_GEOMETRY, type ForkLaneKey, type PipelineGeometry } from "@/lib/pipeline-geometry";
import { cn } from "@/lib/utils";
import { animatedEdgeCount, stageStatesFromReviewStatus, type ReviewStatusLike, type StageEntry } from "./state";
import styles from "./StageRail.module.css";

export { animatedEdgeCount, stageStatesFromReviewStatus };
export type { ReviewStatusLike, StageEntry };

// ---------------------------------------------------------------------------------------
// Props — props.ts's frozen StageRailProps, extended locally (OWNERSHIP rule: props.ts is
// read-only; a missing field is added here and reported under `raised`). EvidenceFrameProps'
// four fields (index / provenance / capturedAt / ext) have no `category`, `identifier` or
// `meta` to build a full <Exhibit> from — those three are added below too.
// ---------------------------------------------------------------------------------------

export interface StageRailProps extends EvidenceFrameProps {
  stages: readonly StageEntry[];
  orientation: "horizontal" | "vertical";
  mode: "live" | "replay" | "static";
  /** ReviewStatus.stage_index — 1-based. Live: drives the progressbar and the aria-live
   *  announcement. Replay: ignored (the sequence tracks its own current stage). */
  stageIndex?: number | null;
  /** ReviewStatus.seconds_since_heartbeat — live only; drives the heartbeat dot/text and the
   *  `> 20s -> degraded` read (HEARTBEAT.staleAfterMs, @/motion/tokens). */
  secondsSinceHeartbeat?: number | null;
  /** p50 stage latency in ms (getCostSummary().per_stage, ×1000) — the hover/focus readout.
   *  A stage missing from the map shows no latency, not a zero. */
  expectedMs?: Partial<Record<Stage, number>>;
  /** The terminal gate, resolved after `delivery` (GateInfo.conclusion). Live: the polled
   *  review's own gate once terminal. Replay: applied at the sequence's last beat — the 0ms
   *  flip (GateBlock's own `stamp`) IS the "gate resolving" the brief asks for. Omitted:
   *  no gate block renders at all (a bare rail, e.g. the lab's mid-run simulations). */
  gate?: GateConclusion;
  /** Fires when the ▶ control is pressed (a fresh run from t = 0). Autoplaying in view does
   *  not call it — that is the section entering the viewport, not a person choosing to run
   *  it again — see the motion-spec §4.6.1 distinction this mirrors. Replay only. */
  onPlay?: () => void;
  /** The demo run's own stage durations in ms, already × time_scale (getDemoRun().stages —
   *  plan A11: never hardcode a duration a fixture provides). Replay only; a stage missing
   *  from the map falls back to 900ms so the sequence still completes. */
  durationsMs?: Partial<Record<Stage, number>>;
  /** The backend's stage labels (getDemoRun().stages[].label / ReviewStatus.stage_label for
   *  the one current stage) — the hover/focus readout's second line. Falls back to the
   *  stage's own key, capitalised, so the component never shows nothing. */
  stageLabels?: Partial<Record<Stage, string>>;
  /** Milliseconds after the last stage before a replay's sequence formally ends. Default
   *  1200 — enough for the gate's stamp to read before the ▶ control re-arms. */
  holdMs?: number;
  /** Full <Exhibit> framing: props.ts's EvidenceFrameProps has no category/identifier/meta
   *  (raised). Defaults: category "PIPELINE", no identifier, no meta. */
  category?: string;
  identifier?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

const DEFAULT_STAGE_MS = 900;
const DEFAULT_HOLD_MS = 1200;

const STAGE_FALLBACK_LABEL: Record<Stage, string> = {
  ingest: "Ingest",
  context: "Context",
  specialists: "Running four specialist passes",
  coordinator: "Coordinator",
  severity: "Severity",
  identity: "Identity",
  proof: "Proof",
  delivery: "Delivery",
  finalise: "Finalise",
};

const FORK_LANE_LABEL: Record<ForkLaneKey, string> = { bugs: "bugs", security: "security", tests: "tests", quality: "quality" };

function formatSeconds(ms: number | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

function stageCaption(index: number, key: Stage): string {
  return `S${index + 1} ${key.toUpperCase()}`;
}

function allPending(): Record<Stage, StageState> {
  return Object.fromEntries(STAGES.map((k) => [k, "pending" as const])) as Record<Stage, StageState>;
}

function toMap(stages: readonly StageEntry[]): Record<Stage, StageState> {
  const map = allPending();
  for (const s of stages) map[s.key] = s.state;
  return map;
}

// ---------------------------------------------------------------------------------------

export function StageRail({
  stages,
  orientation,
  mode,
  stageIndex,
  secondsSinceHeartbeat,
  expectedMs,
  gate,
  onPlay,
  durationsMs,
  stageLabels,
  holdMs = DEFAULT_HOLD_MS,
  index = "01",
  category = "PIPELINE",
  identifier,
  provenance,
  capturedAt,
  ext,
  meta,
  className,
}: StageRailProps) {
  // -- state: `static`/`live` render `stages` as given; `replay` runs its own sequence and
  // ignores `stages` except as its (already-complete) rest frame, so the diagram is never
  // blank before JS runs (useSequence's own contract: rest = end frame).
  const [replayMap, setReplayMap] = useState<Record<Stage, StageState>>(() => toMap(stages));
  // Whether the sequence has reached its last beat, NOT a copy of `gate` itself — so the
  // gate below always reads the CURRENT `gate` prop, never one closed over when the
  // schedule was built (which only happens once — see the deps comment on `steps`).
  const [replayEnded, setReplayEnded] = useState(mode === "replay");
  const givenMap = useMemo(() => toMap(stages), [stages]);
  const stateMap = mode === "replay" ? replayMap : givenMap;
  const effectiveGate = mode === "replay" ? (replayEnded ? gate : undefined) : gate;

  const steps = useMemo<SequenceStep[]>(() => {
    if (mode !== "replay") return [];
    let t = 0;
    const starts: [Stage, number][] = STAGES.map((key) => {
      const at = t;
      t += durationsMs?.[key] ?? DEFAULT_STAGE_MS;
      return [key, at];
    });
    const out: SequenceStep[] = starts.map(([key, at], i) => ({
      at,
      label: key,
      apply: () =>
        setReplayMap((prev) => {
          const next = { ...prev, [key]: "running" as const };
          if (i > 0) next[starts[i - 1][0]] = "done";
          return next;
        }),
    }));
    out.push({
      at: t,
      beat: false,
      label: "gate",
      apply: () => {
        setReplayMap((prev) => ({ ...prev, [STAGES[STAGES.length - 1]]: "done" }));
        setReplayEnded(true);
      },
    });
    return out;
    // durationsMs is read once, at step-BUILD time (the schedule itself); re-running the
    // memo on every render would rebuild useSequence's schedule mid-play. Callers pass
    // stable fixture data (plan A7), so it is intentionally left out of the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Autoplay/hold are replay-only: `steps` is already [] for live/static (so there is
  // nothing to schedule), but leaving autoplay armed would still wire up an
  // IntersectionObserver and a stray hold timer that mode never uses.
  // Destructured, never kept as one `sequence` object: @/motion/useSequence's own header
  // warns that `ref={seq.ref}` makes the lint treat the whole return value as a ref and
  // flag every `seq.x` read as "accessed during render".
  const { ref: sequenceRef, restart } = useSequence<HTMLDivElement>(steps, {
    autoplay: mode === "replay" ? "in-view" : "none",
    reset: () => {
      setReplayMap(allPending());
      setReplayEnded(false);
    },
    hold: mode === "replay" ? holdMs : 0,
  });

  const handlePlay = useCallback(() => {
    onPlay?.();
    restart();
  }, [onPlay, restart]);

  // -- hover / focus readout: the single controlled panel every station's `onMouseEnter` /
  // `onFocus` writes to (brief: "in a tooltip or inline" — inline, so it works identically
  // with a mouse and a keyboard, no floating-panel positioning against an SVG-relative point).
  const [activeKey, setActiveKey] = useState<Stage | null>(null);

  // -- live: aria-live only on `stage_index` CHANGE (design §8.4), never on every poll. A
  // render-phase adjustment (React's own "adjusting state when a prop changes" pattern —
  // GateBlock, wave 1, does the same for its own announcement), not an effect: it lands in
  // the same commit as the change, with no extra render, and the region still exists (empty)
  // from first paint regardless, satisfying the fallback-handshake rule generally.
  const [announced, setAnnounced] = useState<{ stageIndex: number | null | undefined; text: string }>({ stageIndex, text: "" });
  if (mode === "live" && announced.stageIndex !== stageIndex) {
    const inRange = stageIndex != null && stageIndex >= 1 && stageIndex <= STAGES.length;
    setAnnounced({ stageIndex, text: inRange ? `Stage ${stageIndex} of ${STAGES.length}, ${STAGES[stageIndex - 1]}` : announced.text });
  }
  const announcement = announced.text;

  const currentStageKey = mode === "live" && stageIndex && stageIndex >= 1 && stageIndex <= STAGES.length ? STAGES[stageIndex - 1] : null;
  const heartbeatAgeMs = secondsSinceHeartbeat == null ? null : secondsSinceHeartbeat * 1000;

  const body = (
    // `sequenceRef` is the "in-view" autoplay's own trigger element (@/motion/useSequence:
    // "Attach to the set-piece root"); attaching it here even outside replay mode is inert —
    // `steps` is empty, so there is nothing to autoplay.
    <div ref={sequenceRef} className={cn("relative", className)}>
      {orientation === "vertical" ? (
        <RailFigure
          geometry={PIPELINE_GEOMETRY.vertical}
          stateMap={stateMap}
          expectedMs={expectedMs}
          stageLabels={stageLabels}
          setActiveKey={setActiveKey}
          showCaptions
        />
      ) : (
        <>
          <div className="hidden min-[1280px]:block">
            <RailFigure
              geometry={PIPELINE_GEOMETRY.wide}
              stateMap={stateMap}
              expectedMs={expectedMs}
              stageLabels={stageLabels}
              setActiveKey={setActiveKey}
              showCaptions={false}
              showLaneLabels
            />
          </div>
          <div className="min-[1280px]:hidden">
            <RailFigure
              geometry={PIPELINE_GEOMETRY.medium}
              stateMap={stateMap}
              expectedMs={expectedMs}
              stageLabels={stageLabels}
              setActiveKey={setActiveKey}
              showCaptions={false}
            />
          </div>
        </>
      )}

      {/* The hover/focus readout: always present (reserved height), so a station's info
          never shifts layout when it arrives. */}
      <p className="mt-2 min-h-[1.4em] type-data text-[11px] text-text-dim" aria-hidden={activeKey ? undefined : true}>
        {activeKey
          ? `${stageCaption(STAGES.indexOf(activeKey), activeKey)} · ${stageLabels?.[activeKey] ?? STAGE_FALLBACK_LABEL[activeKey]}${
              formatSeconds(expectedMs?.[activeKey]) ? ` · p50 ${formatSeconds(expectedMs?.[activeKey])}` : ""
            }`
          : " "}
      </p>

      {mode === "live" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 type-data text-[11px] text-text-dim">
          <span aria-hidden="true" className="heartbeat" {...heartbeatProps(heartbeatAgeMs)} />
          <span>
            {currentStageKey ? `Stage ${stageIndex}/${STAGES.length} — ${currentStageKey}` : "queued"} · {heartbeatLabel(heartbeatAgeMs)}
          </span>
          <span
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STAGES.length}
            aria-valuenow={stageIndex ?? undefined}
            aria-valuetext={currentStageKey ? `Stage ${stageIndex} of ${STAGES.length}, ${currentStageKey}` : "queued"}
            className="sr-only"
          />
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </span>
        </div>
      ) : null}

      {mode === "replay" || effectiveGate !== undefined ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {mode === "replay" ? (
            <button
              type="button"
              onClick={handlePlay}
              className="hover-ghost inline-flex h-6 items-center gap-1.5 rounded-data border border-rule-2 px-2 type-label text-text-body"
            >
              <Play />
              <span>PLAY</span>
            </button>
          ) : null}
          {/* The terminal gate (props.gate for live/static, the sequence's own resolved value
              for replay): GateBlock owns the 0ms flip, the .stamp and the sole role="alert"
              in the product (design §1.8, motion §4.9.4) — nothing here duplicates it. */}
          {effectiveGate !== undefined ? <GateBlock conclusion={effectiveGate} /> : null}
        </div>
      ) : null}

      {/* Free SEO / screen-reader support behind the SVG (design §8.4, §4.7): the nine
          stage names and their current state, as real text. */}
      <ol className="sr-only" aria-label="Pipeline stages">
        {STAGES.map((key) => (
          <li key={key}>
            {stageLabels?.[key] ?? STAGE_FALLBACK_LABEL[key]} — {stateMap[key]}
          </li>
        ))}
      </ol>
    </div>
  );

  if (!provenance) return body;
  return (
    <Exhibit index={index} category={category} identifier={identifier} provenance={provenance} capturedAt={capturedAt} ext={ext} meta={meta}>
      {body}
    </Exhibit>
  );
}

// ---------------------------------------------------------------------------------------
// RailFigure — one breakpoint's geometry: the SVG connectors plus an HTML overlay of
// focusable stations (percent-positioned over the SVG's own viewBox — see
// pipeline-geometry.ts's `asPercent`, which is exactly why every geometry is expressed in
// its own fixed width/height rather than being unit-less).
// ---------------------------------------------------------------------------------------

interface RailFigureProps {
  geometry: PipelineGeometry;
  stateMap: Record<Stage, StageState>;
  expectedMs?: Partial<Record<Stage, number>>;
  stageLabels?: Partial<Record<Stage, string>>;
  setActiveKey: Dispatch<SetStateAction<Stage | null>>;
  showCaptions: boolean;
  showLaneLabels?: boolean;
}

function edgeClass(state: StageState): string {
  switch (state) {
    case "running":
      return styles.running;
    case "degraded":
      return styles.degraded;
    default:
      return "";
  }
}
function edgeColor(state: StageState): string {
  switch (state) {
    case "pending":
      return "stroke-stage-pending-connector";
    case "running":
      return "stroke-stage-running-connector";
    case "done":
      return "stroke-stage-done-connector";
    case "degraded":
      return "stroke-stage-degraded-connector";
    case "failed":
      return "stroke-stage-failed-connector";
  }
}

function RailFigure({ geometry, stateMap, expectedMs, stageLabels, setActiveKey, showCaptions, showLaneLabels }: RailFigureProps) {
  const forkState = stateMap.specialists;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }} data-breakpoint={geometry.name}>
      <svg viewBox={geometry.viewBox} aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        {geometry.edges.map((edge) => {
          // The connector into `edge.to` carries that stage's own state — a stage reads as
          // "reached" only once its OWN state says so (design §1.11's connector column).
          const state = stateMap[edge.to];
          return (
            <path key={`${edge.from}-${edge.to}`} d={edge.d} pathLength={1} className={cn(styles.edge, edgeColor(state), edgeClass(state))} />
          );
        })}
        {geometry.fork.lanes.map((lane) => (
          <path
            key={lane.key}
            d={lane.d}
            pathLength={1}
            className={cn(styles.edge, edgeColor(forkState), edgeClass(forkState))}
            data-lane={lane.key}
          />
        ))}
      </svg>

      {showLaneLabels
        ? geometry.fork.lanes.map((lane) => {
            // Lifted clear of the lane's own flat run (labelAt sits ON that stroke, never
            // centred on it — a label crossing its own line is unreadable at 9px), away from
            // the baseline the lane bows off: up for a lane above it, down for one below.
            const above = lane.labelAt.y < geometry.fork.entry.y;
            return (
              <span
                key={lane.key}
                aria-hidden="true"
                className="absolute whitespace-nowrap type-data text-[9px] tracking-[0.04em] text-text-dim"
                style={{ ...asPercent(lane.labelAt, geometry), transform: `translate(-50%, ${above ? "-140%" : "40%"})` }}
              >
                {FORK_LANE_LABEL[lane.key]}
              </span>
            );
          })
        : null}

      {/* Horizontal geometries centre this under the fork, which has room either side.
          The vertical spine's fork sits close to the left edge (indented, not centred), so
          centring here would push half the caption off the frame — left-align it instead. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute max-w-[11em] whitespace-normal type-data text-[9px] leading-tight text-text-dim",
          geometry.orientation === "horizontal" && "-translate-x-1/2 whitespace-nowrap",
        )}
        style={asPercent(geometry.forkCaptionAt, geometry)}
      >
        wall clock = max(lane), not sum
      </span>

      {STAGES.map((key, i) => {
        const point = geometry.stations[key];
        const state = stateMap[key];
        const label = stageLabels?.[key] ?? STAGE_FALLBACK_LABEL[key];
        const p50 = formatSeconds(expectedMs?.[key]);
        const isProof = key === "proof";
        // Node encoding (design §1.11): pending/running are a hollow ring in the state's own
        // colour; done/degraded/failed are a solid fill, so the glyph inside needs the
        // INVERSE (--ink-0) to stay legible against it — never the state colour on itself.
        const filled = state === "done" || state === "degraded" || state === "failed";
        return (
          <button
            key={key}
            type="button"
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal-hi focus-visible:ring-offset-2 focus-visible:ring-offset-ink-0"
            style={asPercent(point, geometry)}
            data-state={state}
            data-stage={key}
            onMouseEnter={() => setActiveKey(key)}
            onMouseLeave={() => setActiveKey((k) => (k === key ? null : k))}
            onFocus={() => setActiveKey(key)}
            onBlur={() => setActiveKey((k) => (k === key ? null : k))}
          >
            {/* Five SHAPES, not five colours (design §1.11, §8.2): ring / ring / disc / triangle
                / square, so the state survives greyscale — matching StageDot's own encoding
                (@/components/badges/stage-dot.tsx), reimplemented at station size here because
                a station also carries its identifying glyph, which StageDot does not. */}
            <span
              className={cn(
                "relative inline-flex items-center justify-center transition-none",
                isProof ? "h-8 w-8" : "h-6 w-6",
                state === "pending" && "rounded-full border border-stage-pending-node",
                state === "running" && "rounded-full border-2 border-stage-running-node",
                state === "done" && "rounded-full bg-stage-done-node",
                state === "degraded" && "bg-stage-degraded-node [clip-path:polygon(50%_2%,4%_98%,96%_98%)]",
                state === "failed" && "bg-stage-failed-node",
              )}
            >
              <StageGlyph
                stage={key}
                size={isProof ? 20 : 14}
                className={filled ? "text-ink-0" : STAGE_DOT_COLOR[state]}
                aria-hidden="true"
              />
            </span>
            <span className="sr-only">
              {stageCaption(i, key)} · {label}
              {p50 ? ` · p50 ${p50}` : ""} · {state}
            </span>
            {showCaptions ? <span className="whitespace-nowrap type-label text-[10px] text-text-dim">{stageCaption(i, key)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
