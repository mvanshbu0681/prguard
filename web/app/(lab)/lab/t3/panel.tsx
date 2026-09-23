"use client";
// OWNER: T3 (wave 1). The lab's instrument panel: which runtime mode the page loaded in,
// where the handshake stands (measured in this browser, not typed), and the reduced-motion
// toggle, which writes data-motion="reduced" on <html> exactly as the product's footer
// toggle does (motion spec §5: one code path with the OS preference).
import { useSyncExternalStore, type ReactNode } from "react";
import { animReadyInfo, FORCE_REVEAL_MS, onAnimReady, type AnimReady } from "@/motion/handshake";
import { setMotionOverride, useMotionOverride, useReducedMotion } from "@/motion/reduced";
import { LabButton, ms, Readouts, U } from "./lab-ui";
import { LATE_MS, RUNTIME_MODES, type RuntimeMode } from "./modes";

const subscribeReady = (onChange: () => void) => onAnimReady(() => onChange());
const serverReady = (): AnimReady | null => null;

/** The first markAnimReady() on this document, live. */
export function useAnimReady(): AnimReady | null {
  return useSyncExternalStore(subscribeReady, animReadyInfo, serverReady);
}

const MODE_LABEL: Record<RuntimeMode, ReactNode> = {
  ok: "runtime loads",
  late: (
    <>
      loads at <U>{LATE_MS}ms</U>
    </>
  ),
  blocked: "runtime blocked",
};

export function MotionPanel({ mode }: { mode: RuntimeMode }) {
  const ready = useAnimReady();
  const reduced = useReducedMotion();
  const override = useMotionOverride();
  const reducedLabel = !reduced ? "off" : override === "reduced" ? "on · page toggle" : "on · OS preference";
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Runtime mode" className="flex flex-wrap items-center gap-2">
        <span className="type-label text-text-dim">runtime</span>
        {RUNTIME_MODES.map((m) => (
          // A full page load, never a client navigation: the handshake is per document.
          <a
            key={m}
            href={m === "ok" ? "/lab/t3" : `/lab/t3?runtime=${m}`}
            aria-current={m === mode ? "page" : undefined}
            className="inline-flex h-8 items-center rounded-data border border-rule-2 px-3 type-label text-text-body transition-colors duration-(--dur-1) ease-snap hover:border-rule-3 hover:bg-ink-3 hover:text-text-primary aria-[current=page]:border-signal aria-[current=page]:text-text-primary"
          >
            {MODE_LABEL[m]}
          </a>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Readouts
          items={[
            { label: "handshake", value: ready ? `ready · ${ready.runtime ?? "runtime"}` : mode === "blocked" ? "armed · never disarmed" : "armed" },
            { label: "disarmed at", value: ready ? ms(ready.at) : `force-reveal at ${FORCE_REVEAL_MS}ms` },
            { label: "kept static", value: ready ? String(ready.kept) : "—" },
            { label: "reduced motion", value: reducedLabel },
          ]}
        />
        <LabButton aria-pressed={override === "reduced"} onClick={() => setMotionOverride(override === "reduced" ? null : "reduced")}>
          reduced motion
        </LabButton>
      </div>
    </div>
  );
}
