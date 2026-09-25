// OWNER: t8a (wave 3). The marketing page's nine sections, typed once so the
// nav's live index, the nav's anchor links, the mobile sheet and any future
// consumer read the same ids and cannot drift from app/(marketing)/page.tsx.
//
// The id / index / category triples mirror the section stubs in
// app/(marketing)/_sections/**, which page.tsx (frozen, T0) mounts in this
// exact order. This file does not import page.tsx (it is JSX, and importing
// it here would pull nine section components into every consumer); instead
// tests/unit/marketing-shell/sections.test.ts reads the stub files' own
// `id="..."` and index-label text and asserts they match this list, so a
// wave-3 builder who renames a section id there breaks a test here instead
// of silently breaking the nav.
export interface MarketingSection {
  /** The section's `id`, and the nav/footer anchor target (`#${id}`). */
  id: string;
  /** The section-index grammar's number, e.g. "01" (design §4.4). */
  index: string;
  /** The section-index grammar's category, already upper-cased (four words max). */
  category: string;
}

export const MARKETING_SECTIONS: readonly MarketingSection[] = [
  { id: "proof", index: "01", category: "THE PROOF BENCH" },
  { id: "negation", index: "02", category: "THE NEGATION" },
  { id: "wrong", index: "03", category: "WE WERE WRONG" },
  { id: "comment", index: "04", category: "WHAT LANDS IN YOUR PR" },
  { id: "severity", index: "05", category: "THE INSTRUMENT FACE" },
  { id: "pipeline", index: "06", category: "THE PIPELINE" },
  { id: "record", index: "07", category: "IDENTITY + FLIGHT RECORDER" },
  { id: "accuracy", index: "08", category: "THE ACCURACY REPORT" },
  { id: "run", index: "09", category: "THE CLOSE" },
] as const;

/** Stable id list for useActiveSection — module scope, so the reference never changes. */
export const MARKETING_SECTION_IDS: readonly string[] = MARKETING_SECTIONS.map((section) => section.id);

export interface NavLink {
  id: string;
  label: string;
}

/**
 * The nav's five anchors (brief, binding): a labelled subset of the nine
 * sections, not all of them — §3.1's own four-anchor list is superseded here
 * because two of its labels ("GOVERNANCE") never shipped an id.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { id: "proof", label: "PROOF" },
  { id: "severity", label: "SEVERITY" },
  { id: "pipeline", label: "PIPELINE" },
  { id: "record", label: "RECORD" },
  { id: "accuracy", label: "ACCURACY" },
] as const;

/**
 * A5 / brand-gaps §G: the nav CTA and the hero CTA both scroll to the close's
 * run surface — never to /app. `scroll-behavior: auto` is the default (the
 * root layout sets none of Next's opt-in smooth scrolling), so a plain
 * `href="#run"` anchor jumps instantly.
 */
export const RUN_SECTION_ID = "run";

/** The section a judge lands on from the "READ THE ACCURACY REPORT" link. */
export const ACCURACY_SECTION_ID = "accuracy";
