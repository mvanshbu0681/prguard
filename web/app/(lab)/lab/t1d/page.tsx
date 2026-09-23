// OWNER: t1d (wave 1). /lab/t1d — the code, terminal and diff surfaces in isolation.
//
// Section 01 is the Proof Bench's two panes exactly as landing §01 specifies them (the
// bench chrome itself is T4's). Every other section exercises one contract: the disproven
// pane, highlighted source, the diff with a finding line and its annotation slot, the
// no-wrap rule at 375px, the ANSI class mapping, split view, all ten grammars plus the
// unsupported-language note, the client fallback, and every rail tone.
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { CodeBlock, CodeBlockClient, PRGuardDiff, PYTEST_TONES, RAIL_TONES, TerminalBlock } from "@/components/code";
import {
  ANSI_PANE,
  AUDIT_JSON,
  BAND_DIFF,
  BAND_HIGHLIGHTS,
  BASE,
  BASE_PANE,
  CHARGE_DIFF,
  CHARGE_HEAD,
  CHARGE_START,
  DISPROVEN,
  DISPROVEN_HEAD_PANE,
  FINDING,
  HEAD,
  HEAD_PANE,
  LANGUAGE_SPECIMENS,
  LONG_PANE,
  REPRO,
  REPRO_SOURCE,
  REPRO_START,
  REVIEW,
} from "./specimens";

export const metadata: Metadata = { title: "Code surfaces (lab)" };

const PAPER: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
};

function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 py-10" aria-labelledby={`s-${index}`}>
      <h2 id={`s-${index}`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6 space-y-3">{children}</div>
    </section>
  );
}

/** A token or identifier inside prose: mono, never broken at its hyphens. */
function Token({ children }: { children: ReactNode }) {
  return <code className="font-mono whitespace-nowrap">{children}</code>;
}

/** The props a specimen was rendered with, in mono. Wraps: it is a caption, not evidence. */
function Props({ children }: { children: ReactNode }) {
  return <p className="type-data text-text-dim [overflow-wrap:anywhere]">{children}</p>;
}

/** Lab stand-in for the bench's seam (the real one is T4's). The SHA keeps its case. */
function Seam({ sha }: { sha: string }) {
  return (
    <div className="flex items-center gap-3 border-y border-rule-1 bg-ink-1 px-4 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-rule-1" />
      <span className="type-label text-text-dim">
        — HEAD <span className="tracking-normal normal-case">{sha}</span> —
      </span>
      <span className="h-px flex-1 bg-rule-1" />
    </div>
  );
}

const LEGEND: [string, string, string][] = [
  ["30 / 90 black", "prg-ansi-fg-black", "--ansi-black → --ink-5"],
  ["31 / 91 red", "prg-ansi-fg-red", "--ansi-red → --alarm-text"],
  ["32 / 92 green", "prg-ansi-fg-green", "--ansi-green → --diff-add-text"],
  ["33 / 93 yellow", "prg-ansi-fg-yellow", "--ansi-yellow → --marker-text"],
  ["34 / 94 blue", "prg-ansi-fg-blue", "--ansi-blue (#4FC4D4)"],
  ["35 / 95 magenta", "prg-ansi-fg-magenta", "--ansi-magenta → --signal-hi"],
  ["36 / 96 cyan", "prg-ansi-fg-cyan", "--ansi-cyan → --signal-text"],
  ["37 / 97 white", "prg-ansi-fg-white", "--ansi-white → --text-primary"],
  ["38;5 · 38;2", "nearest family", "grey midtones → prg-ansi-dim"],
  ["5 blink", "dropped", "nothing on this product flashes"],
];

export default function CodeSurfacesLab() {
  return (
    <div data-surface="app" className="min-h-dvh" style={PAPER}>
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
        <header>
          <p className="type-label text-text-dim">/ lab — t1d · code, terminal, diff</p>
          <h1 className="mt-3 type-display-h3 text-text-primary">Evidence surfaces</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            TerminalBlock, CodeBlock and PRGuardDiff render captured artifacts as real, selectable text. Lines scroll sideways and never
            wrap, because wrapping destroys traceback alignment.
          </p>
        </header>

        <Section
          index="01"
          title="Proof panes · landing §01"
          note={
            <>
              Pane A ran the repro test at base <Token>{BASE}</Token>, pane B at head <Token>{HEAD}</Token>. The Proof Bench composes
              these two TerminalBlocks; its seam, verdict rail and
              provenance strip are not part of this track.
            </>
          }
        >
          <div className="overflow-hidden rounded-panel border border-rule-2 bg-ink-1">
            <TerminalBlock
              text={BASE_PANE}
              label={`pytest at base ${BASE}`}
              background="signal-tint-lo"
              rail="signal-lo"
              lineNumbers
              highlight={PYTEST_TONES}
              className="rounded-none"
            />
            <Seam sha={HEAD} />
            <TerminalBlock
              text={HEAD_PANE}
              label={`pytest at head ${HEAD}`}
              background="alarm-tint-lo"
              rail="alarm"
              lineNumbers
              highlight={PYTEST_TONES}
              className="rounded-none"
            />
          </div>
          <Props>pane A · background=&quot;signal-tint-lo&quot; rail=&quot;signal-lo&quot; lineNumbers highlight=PYTEST_TONES</Props>
          <Props>pane B · background=&quot;alarm-tint-lo&quot; rail=&quot;alarm&quot; lineNumbers highlight=PYTEST_TONES</Props>
        </Section>

        <Section
          index="02"
          title="Head pane · proof_status: disproven"
          note={
            <>
              The counter-demo: the same bench on finding <Token>{DISPROVEN}</Token>, whose repro test also passes at
              head. Both panes carry the signal rail; nothing here is red.
            </>
          }
        >
          <div className="overflow-hidden rounded-panel border border-rule-2 bg-ink-1">
            <Seam sha={HEAD} />
            <TerminalBlock
              text={DISPROVEN_HEAD_PANE}
              label={`pytest at head ${HEAD}, finding ${DISPROVEN} (proof_status: disproven)`}
              background="signal-tint-lo"
              rail="signal-lo"
              lineNumbers
              highlight={PYTEST_TONES}
              className="rounded-none"
            />
          </div>
          <Props>background=&quot;signal-tint-lo&quot; rail=&quot;signal-lo&quot; lineNumbers highlight=PYTEST_TONES</Props>
        </Section>

        <Section
          index="03"
          title="Source · code block"
          note={
            <>
              Shiki on the server with the prguard-cold theme. The start offset numbers the excerpt as the file does; a highlighted line
              takes a 2px rail in the caller&apos;s tone on an <Token>--ink-3</Token> row.
            </>
          }
        >
          <CodeBlock
            code={REPRO_SOURCE}
            filePath={REPRO}
            startLine={REPRO_START}
            highlight={[{ start: 41, tone: "alarm", label: "failing assertion" }]}
          />
          <Props>
            filePath=&quot;{REPRO}&quot; startLine={REPRO_START} highlight=[&#123; start: 41, tone: &quot;alarm&quot; &#125;]
          </Props>
          <CodeBlock
            code={CHARGE_HEAD}
            filePath="checkout/charge.py"
            title={
              <>
                checkout/charge.py <span className="text-text-dim">@ {HEAD}</span>
              </>
            }
            startLine={CHARGE_START}
            highlight={[{ start: 39, end: 41, tone: "alarm", label: `finding ${FINDING}` }]}
          />
          <Props>startLine={CHARGE_START} highlight=[&#123; start: 39, end: 41, tone: &quot;alarm&quot; &#125;]</Props>
        </Section>

        <Section
          index="04"
          title="Location · unified diff"
          note={
            <>
              PRGuardDiff, unified by default. The +/− gutter glyph is the semantic channel and colour is secondary. The accused line
              trades its diff tint for the finding&apos;s band at 10% (<Token>--sev-critical</Token>) under the blocking rail
              (<Token>--alarm</Token>), and the annotation slot hangs beneath it.
            </>
          }
        >
          <PRGuardDiff
            diff={CHARGE_DIFF}
            highlight={[{ side: "new", start: 41, tone: "alarm", fill: "critical", label: `finding ${FINDING}` }]}
            annotations={[
              {
                side: "new",
                line: 41,
                tone: "alarm",
                label: `finding ${FINDING}`,
                content: (
                  <div className="space-y-1">
                    <p className="type-data text-text-body">
                      finding {FINDING} · review {REVIEW} · {REPRO}
                    </p>
                    <p className="type-small text-text-dim">The inline finding card mounts in this slot, directly beneath the accused line.</p>
                  </div>
                ),
              },
            ]}
          />
          <Props>
            view=&quot;unified&quot; highlight=[&#123; side: &quot;new&quot;, start: 41, tone: &quot;alarm&quot;, fill: &quot;critical&quot; &#125;]
            annotations=[… line 41]
          </Props>
        </Section>

        <Section
          index="05"
          title="No wrap"
          note="A deliberately long line. At 375px the pane scrolls sideways and the page does not: nothing breaks, nothing reflows."
        >
          <TerminalBlock text={LONG_PANE} label="sandbox invocation, long line" lineNumbers highlight={PYTEST_TONES} />
          <Props>lineNumbers highlight=PYTEST_TONES · background=&quot;default&quot; (--ink-1) · no rail</Props>
        </Section>

        <Section
          index="06"
          title="ANSI mapping"
          note="Raw SGR sequences through anser with use_classes. Every colour is a class mapped to the quarantined palette, never an inline style. The last three lines carry pytest's own colours; the highlight rules win, so passed reads cyan, not green."
        >
          <TerminalBlock text={ANSI_PANE} label="ANSI specimen" lineNumbers highlight={PYTEST_TONES} prompt={false} />
          <dl className="grid gap-x-6 gap-y-1 type-data sm:grid-cols-[max-content_max-content_1fr]">
            {LEGEND.map(([sgr, cls, token]) => (
              <div key={sgr} className="contents">
                <dt className="text-text-body">{sgr}</dt>
                <dd className="text-text-dim">{cls}</dd>
                <dd className="mb-2 text-text-dim sm:mb-0">{token}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section index="07" title="Split diff" note="The same diff side by side. Removed lines sit beside the lines that replaced them; the shorter side is padded.">
          <PRGuardDiff
            diff={CHARGE_DIFF}
            view="split"
            highlight={[{ side: "new", start: 41, tone: "alarm", fill: "critical", label: `finding ${FINDING}` }]}
          />
          <Props>view=&quot;split&quot;</Props>
        </Section>

        <Section
          index="08"
          title="Grammars"
          note="The ten bundled languages, each its own lazily loaded grammar. The last file is Elixir, which the bundle does not carry: plain text, gutter intact, and the header says so."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {LANGUAGE_SPECIMENS.map((s) => (
              <div key={s.filePath} className="min-w-0">
                <CodeBlock code={s.code} filePath={s.filePath} lang={s.lang} />
              </div>
            ))}
          </div>
        </Section>

        <Section
          index="09"
          title="Client fallback"
          note="CodeBlockClient renders plain text first, in the identical DOM, then highlights after a lazy import. For code that only exists in the browser."
        >
          <CodeBlockClient code={AUDIT_JSON} lang="json" title="canonical_json" label="Audit document, canonical JSON" />
        </Section>

        <Section
          index="10"
          title="Rail tones"
          note={
            <>
              Every tone a highlighted line or pane rail accepts. Rails are fills: <Token>--alarm</Token> appears only here, never as text.
            </>
          }
        >
          <CodeBlock
            code={RAIL_TONES.map((tone) => `rail ${tone}`).join("\n")}
            lang="text"
            title="RailTone"
            highlight={RAIL_TONES.map((tone, i) => ({ start: i + 1, tone }))}
          />
          <PRGuardDiff diff={BAND_DIFF} filePath="specimen/bands.py" highlight={BAND_HIGHLIGHTS} />
          <Props>
            PRGuardDiff highlight: fill is the band at 10% in place of the diff tint, tone is the rail. Rows 1 and 8 carry no
            highlight, for reference.
          </Props>
        </Section>
      </div>
    </div>
  );
}
