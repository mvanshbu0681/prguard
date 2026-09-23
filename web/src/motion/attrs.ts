// OWNER: T3 (wave 1). The attribute and class names of the fallback handshake
// (design §4.7, motion spec §3.5), shared by ./handshake.tsx (which writes the CSS
// and disarms it) and ./reveal.ts (which reveals). A leaf module, so neither
// imports the other's side effects.
//
// Engine-free. Safe to import from server components.

import { HANDSHAKE } from "./tokens";

/** Content is never invisible for longer than this, even if every script fails. */
export const FORCE_REVEAL_MS = HANDSHAKE.forceRevealMs;

/** The keyframe that turns a [data-anim] element visible at FORCE_REVEAL_MS. */
export const FORCE_REVEAL_KEYFRAME = "prg-force-reveal";

/** Marks an element whose FIRST appearance the runtime animates (a scroll reveal, a draw). */
export const ANIM_ATTR = "data-anim";

/**
 * Set on a [data-anim] element to reveal it. The runtime writes "" (animate in, see
 * .reveal / .draw in src/styles/motion.css) or "static" (show it with no animation:
 * its force-reveal already fired, so animating it would flash it hidden first).
 */
export const ANIM_IN_ATTR = "data-anim-in";
export const ANIM_IN_STATIC = "static";

/** Written on <html> once a runtime has loaded and run a frame. Disarms the force-reveal. */
export const ANIM_READY_CLASS = "anim-ready";

/** Written on <html> next to ANIM_READY_CLASS: which runtime disarmed it ("gsap" | "motion"). */
export const ANIM_RUNTIME_ATTR = "data-anim-runtime";

/** Spread onto an element: `<li {...ANIM_PROPS} className="reveal">`. */
export const ANIM_PROPS = { [ANIM_ATTR]: "" } as const;

/** The batch position a reveal was given (drives the capped stagger in motion.css). */
export const REVEAL_INDEX_VAR = "--reveal-index";

/**
 * A force-reveal this close to firing counts as fired: the element is shown statically
 * instead of being hidden again for a reveal (one frame of style recalc plus slack).
 */
export const FIRED_MARGIN_MS = 100;
