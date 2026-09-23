"use client";
// OWNER: T3 (wave 1). The 0ms flip + the 180ms stamp (motion spec §2.5, plan §2 hard
// rule 3), in both modes of the .stamp contract:
//   controlled   the class stays on; useStamp(value) drives data-stamp rest → a ↔ b
//   declarative  the element re-mounts (a React key) with the class after a change,
//                which is how track t1c's chips do it
// The readouts are measured on the element after each flip: its transition-duration
// (0s: no transition at all, whatever the utilities say) and the animation it runs.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useStamp } from "@/motion/stamp";
import { LabButton, Readouts } from "./lab-ui";

type Verdict = "not_attempted" | "inconclusive" | "disproven" | "proven";
const VERDICTS: readonly Verdict[] = ["not_attempted", "inconclusive", "disproven", "proven"];
const CHIP: Record<Verdict, string> = {
  proven: "border-proof-proven-border bg-proof-proven-bg text-proof-proven-fg",
  disproven: "border-proof-disproven-border bg-proof-disproven-bg text-proof-disproven-fg",
  inconclusive: "border-dashed border-proof-inconclusive-border bg-proof-inconclusive-bg text-proof-inconclusive-fg",
  not_attempted: "border-proof-not-attempted-border bg-proof-not-attempted-bg text-proof-not-attempted-fg",
};
const CHIP_BASE = "inline-flex h-5 min-w-[120px] items-center justify-center rounded-data border px-1.5 type-badge";

type Gate = "clear" | "blocked";
const GATE: Record<Gate, string> = {
  blocked: "border-gate-failure-border bg-gate-failure-bg text-gate-failure-fg",
  clear: "border-gate-success-border bg-gate-success-bg text-gate-success-fg",
};

interface Measured {
  transition: string;
  animation: string;
}

/** What the element is doing right now, read from the browser. */
function measure(el: Element | null): Measured {
  if (!el) return { transition: "—", animation: "—" };
  const anim = el.getAnimations?.()[0] as CSSAnimation | undefined;
  const timing = anim?.effect?.getTiming();
  return {
    transition: getComputedStyle(el).transitionDuration,
    animation: anim && timing ? `${anim.animationName} · ${Number(timing.duration)}ms` : "none",
  };
}

function useMeasured(value: unknown): [RefObject<HTMLSpanElement | null>, Measured] {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [measured, setMeasured] = useState<Measured>({ transition: "—", animation: "—" });
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMeasured(measure(ref.current)));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return [ref, measured];
}

function ControlledVerdict() {
  const [verdict, setVerdict] = useState<Verdict>("proven");
  const stamp = useStamp(verdict);
  const [chip, measured] = useMeasured(verdict);
  return (
    <div className="space-y-4 p-5">
      <p className="type-label text-text-dim">controlled · useStamp</p>
      <div className="flex min-h-5 flex-wrap items-center gap-3">
        <span ref={chip} className={`stamp ${CHIP_BASE} ${CHIP[verdict]}`} data-stamp={stamp} data-state={verdict} role="status">
          {verdict.replace("_", " ")}
        </span>
        {verdict === "disproven" ? <span className="type-small text-text-dim">refuted by execution</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {VERDICTS.map((v) => (
          <LabButton key={v} aria-pressed={v === verdict} onClick={() => setVerdict(v)}>
            {v.replace("_", " ")}
          </LabButton>
        ))}
      </div>
      <Readouts
        items={[
          { label: "data-stamp", value: stamp },
          { label: "transition", value: measured.transition },
          { label: "animation", value: measured.animation },
        ]}
      />
    </div>
  );
}

function DeclarativeGate() {
  const [gate, setGate] = useState<Gate>("clear");
  const [changes, setChanges] = useState(0);
  const [chip, measured] = useMeasured(changes);
  const flip = () => {
    setGate((g) => (g === "clear" ? "blocked" : "clear"));
    setChanges((n) => n + 1);
  };
  return (
    <div className="space-y-4 p-5">
      <p className="type-label text-text-dim">declarative · re-mount with the class</p>
      <div className="flex min-h-5 flex-wrap items-center gap-3">
        {/* First paint has no `stamp` class: a page load is not a verdict arriving. */}
        <span
          key={changes}
          ref={chip}
          className={`${changes > 0 ? "stamp " : ""}inline-flex h-5 items-center rounded-data border px-1.5 type-badge ${GATE[gate]}`}
          data-state={gate}
          role="status"
        >
          gate · {gate}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <LabButton onClick={flip}>{gate === "clear" ? "block the merge" : "clear the gate"}</LabButton>
      </div>
      <Readouts
        items={[
          { label: "class", value: changes > 0 ? "stamp" : "—" },
          { label: "transition", value: measured.transition },
          { label: "animation", value: measured.animation },
        ]}
      />
    </div>
  );
}

export function StampDemo() {
  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-rule-1 bg-rule-1 md:grid-cols-2">
      <div className="bg-ink-1">
        <ControlledVerdict />
      </div>
      <div className="bg-ink-1">
        <DeclarativeGate />
      </div>
    </div>
  );
}
