// OWNER: t1c (wave 1). /lab/t1c — every icon at every size, every chip in every state, and
// the whole badge sheet again under grayscale(1) to prove the redundant encodings.
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Copy, Download, ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { formatScore } from "@/components/badges";
import {
  BANNED_ICON_PATTERNS,
  Check,
  Cross,
  DoubleBar,
  Ellipsis,
  FingerprintMark,
  GATE_ART,
  GateGlyph,
  GovernanceMark,
  Icon,
  LEDGER_ART,
  LEVEL_ART,
  LedgerGlyph,
  Play,
  ProofMark,
  RIDGE_ART,
  RUNG_ART,
  Restore,
  RungGlyph,
  SEAL_ART,
  STAGE_ART,
  SeverityMark,
  Sigma,
  StageGlyph,
  VIAL_ART,
  VIAL_FOR_STATUS,
  Warn,
  type Art,
} from "@/components/icons";
import { SEVERITY_THRESHOLDS, STAGES } from "@/lib/contracts";
import { BadgeSheet } from "./badge-sheet";
import { FixtureRow } from "./fixture-row";
import { Construction, Panel, Section, SizeHeads, SizeRow } from "./specimens";
import { StampDemo } from "./stamp-demo";
import { PROOF_STATUSES } from "./states";

export const metadata: Metadata = { title: "Badges and icons (lab)" };

const PAPER: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
};

const constructions = (art: Art) => [
  <Construction key="16" art={art} board={16} cell={6} />,
  <Construction key="24" art={art} board={24} cell={4} />,
];

const TEXT_SIZES = [
  { label: "11 · label", className: "type-label text-text-body" },
  { label: "12.5 · data", className: "type-data text-text-body" },
  { label: "13 · terminal", className: "type-terminal text-text-body" },
  { label: "20 · readout", className: "type-readout text-text-primary" },
  { label: "48 · readout-xl", className: "type-readout-xl text-text-primary" },
];

const GLYPH_ROWS = [
  { name: "Play", char: "▶", G: Play },
  { name: "Restore", char: "↻", G: Restore },
  { name: "Check", char: "✓", G: Check },
  { name: "Cross", char: "✗", G: Cross },
  { name: "Warn", char: "⚠", G: Warn },
  { name: "Ellipsis", char: "⋯", G: Ellipsis },
  { name: "Sigma", char: "Σ", G: Sigma },
  { name: "DoubleBar", char: "‖", G: DoubleBar },
];

const LUCIDE = [
  { name: "Search", icon: Search },
  { name: "Copy", icon: Copy },
  { name: "Download", icon: Download },
  { name: "ExternalLink", icon: ExternalLink },
  { name: "SlidersHorizontal", icon: SlidersHorizontal },
  { name: "X", icon: X },
];

export default function T1cLab() {
  const critical = formatScore(SEVERITY_THRESHOLDS.critical);
  return (
    <div data-surface="app" className="min-h-dvh bg-ink-0" style={PAPER}>
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <header className="pb-10">
          <p className="type-label text-text-dim">/ lab — t1c · semantic badges and icons</p>
          <h1 className="mt-3 type-display-h2 text-text-primary">Badges and icons</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            Every icon PRGuard draws, at every size on the 12 · 14 · 16 · 20 · 24 scale, and every semantic chip in every state. Each
            state is carried by a glyph, a fill count or a border style as well as its colour; section 07 removes the colour to check.
          </p>
        </header>

        <Section
          index="01"
          title="Mechanic marks"
          note="One stroke language: 1.25px on the 16 grid, 1.5px on the 24 grid, 1px on the hinted 12 grid that chips use. Butt caps, miter joins, currentColor. The grids on the right show each artboard at true stroke width."
        >
          <Panel className="w-fit max-w-full overflow-x-auto px-4 md:px-6">
            <table className="border-collapse">
              <caption className="sr-only">The four mechanic marks at every icon size</caption>
              <thead>
                <SizeHeads first="mark" extra={["16 grid", "24 grid"]} />
              </thead>
              <tbody>
                {PROOF_STATUSES.map((s) => (
                  <SizeRow
                    key={s}
                    name={
                      <>
                        proof · {s} <span className="text-text-dim">({VIAL_FOR_STATUS[s]})</span>
                      </>
                    }
                    render={(z) => <ProofMark status={s} size={z} />}
                    extra={constructions(VIAL_ART[VIAL_FOR_STATUS[s]])}
                  />
                ))}
                <SizeRow name="severity · spirit level" render={(z) => <SeverityMark size={z} />} extra={constructions(LEVEL_ART)} />
                <SizeRow name="fingerprint · ridges" render={(z) => <FingerprintMark size={z} />} extra={constructions(RIDGE_ART)} />
                <SizeRow name="governance · seal" render={(z) => <GovernanceMark size={z} />} extra={constructions(SEAL_ART)} />
              </tbody>
            </table>
          </Panel>
        </Section>

        <Section
          index="02"
          title="Station glyphs"
          note="StageGlyph for the nine STAGES. Severity, identity, proof and finalise are the mechanic marks themselves, so the pipeline and the mechanics read as one hand."
        >
          <Panel className="w-fit max-w-full overflow-x-auto px-4 md:px-6">
            <table className="border-collapse">
              <caption className="sr-only">The nine pipeline station glyphs at every icon size</caption>
              <thead>
                <SizeHeads first="stage" extra={["16 grid", "24 grid"]} />
              </thead>
              <tbody>
                {STAGES.map((st, i) => (
                  <SizeRow
                    key={st}
                    name={
                      <>
                        <span className="text-text-dim">S{i + 1}</span> {st}
                      </>
                    }
                    render={(z) => <StageGlyph stage={st} size={z} />}
                    extra={constructions(STAGE_ART[st])}
                  />
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>

        <Section index="03" title="Chip glyphs" note="The glyphs the chips carry, so no state leans on colour: the ledger, the four gate shapes, and the delivery ladder with the rung that fired.">
          <Panel className="w-fit max-w-full overflow-x-auto px-4 md:px-6">
            <table className="border-collapse">
              <caption className="sr-only">Chip glyphs at every icon size</caption>
              <thead>
                <SizeHeads first="glyph" extra={["16 grid", "24 grid"]} />
              </thead>
              <tbody>
                <SizeRow name="ledger · suppressed" render={(z) => <LedgerGlyph size={z} />} extra={constructions(LEDGER_ART)} />
                {(["failure", "success", "neutral", "running"] as const).map((g) => (
                  <SizeRow
                    key={g}
                    name={`gate · ${g}`}
                    render={(z) => <GateGlyph state={g} size={z} className={g === "failure" ? "text-alarm" : undefined} />}
                    extra={constructions(GATE_ART[g])}
                  />
                ))}
                {(["0", "1", "2", "3", "none"] as const).map((k) => {
                  const rung = k === "none" ? null : (Number(k) as 0 | 1 | 2 | 3);
                  return (
                    <SizeRow
                      key={k}
                      name={`rung · ${k}`}
                      render={(z) => <RungGlyph rung={rung} size={z} />}
                      extra={constructions(RUNG_ART[k])}
                    />
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </Section>

        <Section
          index="04"
          title="Text glyphs"
          note="Google Sans Code has none of these eight characters. Each replacement is one monospace cell (0.6em) wide and sits on the text baseline, so a column of data keeps its alignment. Its stroke tracks the text size."
        >
          <Panel className="overflow-x-auto px-4 md:px-6">
            <table className="w-full border-collapse">
              <caption className="sr-only">Text glyphs set in Google Sans Code at five sizes</caption>
              <thead>
                <tr className="border-b border-rule-1">
                  <th scope="col" className="py-2 pr-6 text-left type-label font-medium text-text-dim">
                    glyph
                  </th>
                  {TEXT_SIZES.map((t) => (
                    <th key={t.label} scope="col" className="px-3 py-2 text-left type-label font-medium whitespace-nowrap text-text-dim">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GLYPH_ROWS.map(({ name, char, G }) => (
                  <tr key={name} className="border-b border-rule-hair">
                    <th scope="row" className="py-2 pr-6 text-left font-normal type-data whitespace-nowrap text-text-body">
                      {name} <span className="text-text-dim">U+{char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}</span>
                    </th>
                    {TEXT_SIZES.map((t) => (
                      <td key={t.label} className={`px-3 py-2 whitespace-nowrap ${t.className}`}>
                        H<G />H
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel className="overflow-x-auto p-4">
              <p className="mb-3 type-label text-text-dim">column test · glyph line over its ascii twin</p>
              <div className="type-terminal whitespace-pre text-text-body">
                <div className="text-text-dim">0123456789012345678901234567890123</div>
                <div>
                  sha256(prev_hash <DoubleBar /> canonical_json)
                </div>
                <div className="text-text-dim">sha256(prev_hash | canonical_json)</div>
                <div>
                  <Sigma /> contribution ≥ {critical} → critical
                </div>
                <div className="text-text-dim">S contribution ≥ {critical} → critical</div>
                <div>
                  == event_hash <Check /> verified <Cross /> mismatch <Ellipsis />
                </div>
                <div className="text-text-dim">== event_hash v verified x mismatch .</div>
              </div>
            </Panel>
            <Panel className="p-4">
              <p className="mb-3 type-label text-text-dim">in labels · 11px mono caps</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 type-label text-text-body">
                <span>
                  <Play /> play
                </span>
                <span>
                  <Restore /> restore
                </span>
                <span className="text-alarm-text">
                  <Warn /> reason required
                </span>
                <span className="text-signal-text">
                  <Check /> verified
                </span>
              </div>
              <p className="mt-4 type-small text-text-dim">
                Sigma, Ellipsis and DoubleBar keep the real character beside the drawing, visually hidden, so a copied line and a screen reader get it. Play,
                Restore, Check, Cross and Warn decorate a label that already says the thing, so they stay silent.
              </p>
            </Panel>
          </div>
        </Section>

        <Section index="05" title="Utility icons" note="lucide-react through <Icon>: stroke 1.5 on its 24 grid, the same size scale, currentColor. The icons below are refused at runtime and by a repo scan in CI.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="overflow-x-auto px-4 md:px-6">
              <table className="border-collapse">
                <caption className="sr-only">lucide-react icons at every icon size</caption>
                <thead>
                  <SizeHeads first="icon" />
                </thead>
                <tbody>
                  {LUCIDE.map(({ name, icon }) => (
                    <SizeRow key={name} name={name} render={(z) => <Icon icon={icon} size={z} />} />
                  ))}
                  <SizeRow name="beside the marks" render={(z) => <SeverityMark size={z} />} />
                </tbody>
              </table>
            </Panel>
            <Panel className="p-4 md:p-6">
              <p className="mb-3 type-label text-text-dim">banned · §6.5 and the hard rules</p>
              <ul className="type-data">
                {BANNED_ICON_PATTERNS.map((b) => (
                  <li key={b.pattern.source} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 border-b border-rule-hair py-1.5 last:border-b-0">
                    <code className="text-text-primary [overflow-wrap:anywhere]">/{b.pattern.source}/</code>
                    <span className="text-text-body">{b.reason}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </Section>

        <Section index="06" title="Semantic chips" note="Every chip in every state. Specimen scores are the frozen SEVERITY_THRESHOLDS and the value one step below each.">
          <BadgeSheet idPrefix="colour" />
        </Section>

        <Section index="07" title="Without colour" note="The same sheet under filter: grayscale(1). Fill count, glyph, border style and label still separate every state.">
          <div style={{ filter: "grayscale(1)" }}>
            <BadgeSheet idPrefix="grey" />
          </div>
        </Section>

        <Section index="08" title="The 0ms rule" note="A state change flips colour with no transition and re-mounts the chip with the class stamp: track t3's 180ms scale(1.045) → 1. First paint never stamps.">
          <Panel className="p-4 md:p-6">
            <StampDemo />
          </Panel>
        </Section>

        <Section index="09" title="From the fixture corpus" note="The demo findings and the demo review's gate, read from web/public/fixtures (plan A10).">
          <Panel className="p-4 md:p-6">
            <FixtureRow />
          </Panel>
        </Section>
      </div>
    </div>
  );
}
