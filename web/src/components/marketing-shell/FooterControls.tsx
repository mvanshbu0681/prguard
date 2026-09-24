"use client";
// OWNER: t8a (wave 3). The footer's MOTION / CONTRAST row — design-system §7.3
// ("a visible toggle lives in the footer next to the motion toggle"), landing-
// blueprint §15 Left ("[ MOTION: FULL ] [ CONTRAST: STANDARD ]"), motion-spec §5
// ("the footer toggle is a demo asset ... the OS preference and the visible
// footer toggle share one code path"). ui/toggle.tsx's own header comment
// already names this exact use ("the density toggle ... and the footer's
// MOTION / CONTRAST controls"), so this file only wires it up.
//
// MOTION writes data-motion="reduced" on <html> through @/motion/reduced's
// setMotionOverride — the same setter app/(lab)/lab/t3/panel.tsx already uses,
// so the OS query and this toggle share the one code path the spec requires.
// CONTRAST writes data-contrast="high" on <html> (design-system §7.3); no
// wave-1 helper exists for it (only the CSS override and the token file are
// frozen), so this file carries its own small external store, local to this
// island and gone the moment neither toggle is on screen. Both flips are 0ms:
// the attribute write alone drives the token cascade, nothing here transitions.
import { useSyncExternalStore } from "react";
import { setMotionOverride, useMotionOverride } from "@/motion/reduced";
import { Toggle } from "@/components/ui/toggle";

const CONTRAST_ATTR = "data-contrast";

function contrastRoot(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

function getContrastHigh(): boolean {
  return contrastRoot()?.getAttribute(CONTRAST_ATTR) === "high";
}

function setContrastHigh(value: boolean): void {
  const el = contrastRoot();
  if (!el) return;
  if (value) el.setAttribute(CONTRAST_ATTR, "high");
  else el.removeAttribute(CONTRAST_ATTR);
}

function subscribeContrast(onChange: () => void): () => void {
  const el = contrastRoot();
  if (!el || typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(el, { attributes: true, attributeFilter: [CONTRAST_ATTR] });
  return () => observer.disconnect();
}

const serverFalse = () => false;

/** Live value of the `data-contrast="high"` override alone. */
function useContrastHigh(): boolean {
  return useSyncExternalStore(subscribeContrast, getContrastHigh, serverFalse);
}

/** The footer's MOTION / CONTRAST controls (design-system §7.3, landing-blueprint §15). */
export function FooterControls() {
  const motionReduced = useMotionOverride() === "reduced";
  const contrastHigh = useContrastHigh();

  return (
    <div role="group" aria-label="Display controls" className="flex flex-wrap items-center gap-2">
      <Toggle
        variant="outline"
        size="sm"
        pressed={motionReduced}
        onPressedChange={(pressed) => setMotionOverride(pressed ? "reduced" : null)}
      >
        MOTION: {motionReduced ? "REDUCED" : "FULL"}
      </Toggle>
      <Toggle
        variant="outline"
        size="sm"
        pressed={contrastHigh}
        onPressedChange={(pressed) => setContrastHigh(pressed)}
      >
        CONTRAST: {contrastHigh ? "HIGH" : "STANDARD"}
      </Toggle>
    </div>
  );
}
