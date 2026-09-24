// OWNER: t8a (wave 3). Design §15 (composition), brief step 5 (binding link
// set): Lockup B, link columns to things that exist, the close's line, and a
// provenance-style build line. No competitor names, no social icon row.
//
// §15 Left/Centre also put the MOTION/CONTRAST toggle row and the four-glyph
// proof-state legend in this footer (design-system §7.3, motion-spec §5: "the
// OS preference and the visible footer toggle share one code path" — the same
// setMotionOverride wired into app/(lab)/lab/t3/panel.tsx). That row is the
// only interactive part; it is isolated in <FooterControls>, a small client
// island, so the rest of this component stays server-rendered ("Animation:
// none", §15).
//
// brand-gaps §F "First load, JS disabled": the noscript line stating what
// needs JavaScript lives here too, since the footer is the one place on every
// marketing page that renders regardless of route.
import Link from "next/link";
import { Lockup } from "@/components/brand";
import { DEMO_SHORT } from "@/lib/demo-ids";
import { FooterControls } from "./FooterControls";
import { MARKETING_SECTIONS } from "./sections";

/** design-system §6.1 / landing-blueprint §15 Centre: the four proof_status
 *  glyphs the vial mark's silhouettes are drawn from (icons/marks.tsx's M1),
 *  reproduced here as the plain-text legend the footer specifies — lowercase,
 *  because a state is a value, not a chip label (brand-gaps §D). */
const PROOF_STATUS_LEGEND: { glyph: string; label: string }[] = [
  { glyph: "◆", label: "proven" },
  { glyph: "◇", label: "disproven" },
  { glyph: "◈", label: "inconclusive" },
  { glyph: "◌", label: "not_attempted" },
];

interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

/** Short, sentence-case labels for the nine in-page anchors — the section
 *  index's own all-caps category is the right grammar for a section head,
 *  not for a footer link list. Keyed by id so a renamed/added section fails
 *  loudly (an absent key falls back to the raw category) rather than
 *  silently drifting. */
const SECTION_LABELS: Record<string, string> = {
  proof: "Proof",
  negation: "The negation",
  wrong: "We were wrong",
  comment: "What lands in your PR",
  severity: "Severity",
  pipeline: "Pipeline",
  record: "Record",
  accuracy: "Accuracy",
  run: "The close",
};

const SECTION_LINKS: FooterColumn = {
  heading: "SECTIONS",
  links: MARKETING_SECTIONS.map((section) => ({
    label: SECTION_LABELS[section.id] ?? section.category,
    href: `#${section.id}`,
  })),
};

const PRODUCT_LINKS: FooterColumn = {
  heading: "EVIDENCE",
  links: [
    { label: "Accuracy report", href: "/accuracy" },
    { label: "Audit chain", href: "/audit" },
    { label: "Findings", href: "/findings" },
  ],
};

const REPO_LINKS: FooterColumn = {
  heading: "REPOSITORY",
  // No GitHub App / repo is public yet (plan A2 — the backend branch is not
  // merged, there is no hosted OpenAPI). A placeholder, per brief, not a
  // fabricated URL.
  links: [{ label: "GitHub", href: "#" }],
};

function FooterColumnList({ column }: { column: FooterColumn }) {
  return (
    <div className="flex min-w-[9rem] flex-col gap-2">
      <p className="type-label text-text-dim">{column.heading}</p>
      <ul className="flex flex-col gap-2">
        {column.links.map((link) => (
          <li key={link.href + link.label}>
            {link.href.startsWith("#") ? (
              <a href={link.href} className="link-draw type-small">
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="link-draw type-small">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-rule-1 bg-ink-1">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-12 md:px-8 md:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex flex-col gap-4">
            <Lockup variant="B" size="footer" />
            <p className="type-display-h4 max-w-[20ch] text-text-primary">Proven, or it doesn&apos;t block.</p>
          </div>
          <div className="flex flex-wrap gap-x-12 gap-y-8">
            <FooterColumnList column={SECTION_LINKS} />
            <FooterColumnList column={PRODUCT_LINKS} />
            <FooterColumnList column={REPO_LINKS} />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-rule-hair pt-6 md:flex-row md:items-center md:justify-between">
          <FooterControls />
          <p className="type-chip flex flex-wrap items-center gap-x-2 gap-y-1 text-text-dim">
            {PROOF_STATUS_LEGEND.map((state) => (
              <span key={state.label}>
                {state.glyph} {state.label}
              </span>
            ))}
            <span className="text-ink-8">— proven and disproven share a hue because both are execution results</span>
          </p>
        </div>

        <noscript>
          <p className="type-micro text-ink-8">
            Replay, the audit chain tamper control and the live run view need JavaScript. Everything above is static.
          </p>
        </noscript>

        <p className="type-micro text-ink-8">
          Google Sans Code and Inter Variable, SIL OFL 1.1. · build {DEMO_SHORT.review} · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
