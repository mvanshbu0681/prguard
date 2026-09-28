// OWNER: t1a (wave 1).
//
// The OG / social card (brand-gaps §C), 1200 × 630, rendered at build time by
// next/og (Satori + resvg) for app/opengraph-image.tsx and app/twitter-image.tsx.
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  ◉ │ WITNESS                        graph paper, 64px grid   │  Lockup B
//   │  We don't guess.              ┌ base 7c41a09 ─────────────┐   │
//   │  We run the test.             │ 1 passed in 0.42s         │   │  the mini bench
//   │  ├────────────────            ├──── HEAD 9c2d4b1 ─────────┤   │
//   │                               │ 1 failed in 0.39s         │   │
//   │                               └───────────────────────────┘   │
//   │                                               ▣ PROVEN      │
//   ├──────────────────────────────────────────────────────────────┤
//   │  PASSES AT BASE · FAILS AT HEAD · PROVEN      → blocks merge  │  the verdict rail
//   └──────────────────────────────────────────────────────────────┘
//
// Satori constraints are hard (brand-gaps §C): no mask-image, no
// backdrop-filter, no feTurbulence, no CSS custom properties, no oklch. So:
// literal hex only (src/components/brand/palette.ts, test-locked to the
// tokens), the graph paper as real 1px divs, no grain and no glow, and fonts as
// static TTF instances (app/og/fonts; Satori reads neither woff2 nor the
// variable axis). Every div with more than one child is display:flex.
//
// No registration marks on the bench: they are drawn only by <Exhibit> (plan §2
// hard rule 1), and the card cannot render <Exhibit>.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CSSProperties, ReactNode } from 'react';
import { markGeometry, markParts, markViewBox } from '@/components/brand/geometry';
import { GSC_CAP_HEIGHT, WORDMARK_INK, WORDMARK_TRACKING } from '@/components/brand/metrics';
import { BRAND_HEX, FLAT_HEX, flattenWhite } from '@/components/brand/palette';
import type { OgStory } from './data';

export const OG_SIZE = { width: 1200, height: 630 } as const;

const W = OG_SIZE.width;
const H = OG_SIZE.height;
const EDGE = 64; // outer margin, on the first 64px grid line
const FONT = 'Google Sans Code';

// Satori matches fonts only by the nine keyword weights (100…900) and ignores
// the variable axis, so each static instance is registered under a keyword and
// the card asks for that keyword. What renders is the instance's own outlines:
//   GoogleSansCode-400.ttf  as 400  terminal lines and data
//   GoogleSansCode-520.ttf  as 500  the headline (520, design §2.3) and labels (500)
//   GoogleSansCode-560.ttf  as 600  the wordmark (560, brand-gaps §B) and the chip
const FACES = [
  { instance: 400, as: 400 },
  { instance: 520, as: 500 },
  { instance: 560, as: 600 },
] as const;
const WEIGHT = { data: 400, display: 500, wordmark: 600 } as const;

export async function loadOgFonts() {
  const dir = path.join(process.cwd(), 'app', 'og', 'fonts');
  return Promise.all(
    FACES.map(async ({ instance, as }) => ({
      name: FONT,
      data: await readFile(path.join(dir, `GoogleSansCode-${instance}.ttf`)),
      weight: as,
      style: 'normal' as const,
    })),
  );
}

function GraphPaper() {
  const lines: ReactNode[] = [];
  for (let x = 0; x < W; x += 64) {
    lines.push(<div key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, width: 1, height: H, backgroundColor: FLAT_HEX.ruleHairOnInk0 }} />);
  }
  for (let y = 0; y < H; y += 64) {
    lines.push(<div key={`h${y}`} style={{ position: 'absolute', left: 0, top: y, width: W, height: 1, backgroundColor: FLAT_HEX.ruleHairOnInk0 }} />);
  }
  return <>{lines}</>;
}

function MarkSvg({ size }: { size: number }) {
  const g = markGeometry(size);
  const color = { bar: BRAND_HEX.signal, alarm: BRAND_HEX.alarm };
  return (
    <svg width={size} height={size} viewBox={markViewBox(g)}>
      {markParts(g).map((p) =>
        p.stroke ? (
          <path key={p.part} d={p.d} fill="none" stroke={color[p.paint]} strokeWidth={p.stroke} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={p.part} d={p.d} fill={color[p.paint]} />
        ),
      )}
    </svg>
  );
}

/** Lockup B at the card's scale: mark 48 · gap 24 · 1px hairline at cap height · gap 24 · wordmark 36 + rail. */
function LockupB() {
  const word = 36;
  const gap = 24;
  const baseline = 0.84 * word; // GSC with line-height 1: baseline 0.84em below the box top
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <MarkSvg size={48} />
      <div style={{ width: 1, height: Math.round(word * GSC_CAP_HEIGHT), marginLeft: gap, marginRight: gap, backgroundColor: FLAT_HEX.rule2OnInk0 }} />
      <div style={{ display: 'flex', position: 'relative' }}>
        <div
          style={{
            fontSize: word,
            fontWeight: WEIGHT.wordmark,
            lineHeight: 1,
            letterSpacing: word * WORDMARK_TRACKING,
            color: BRAND_HEX.textPrimary,
          }}
        >
          WITNESS
        </div>
        <div
          style={{
            position: 'absolute',
            left: word * WORDMARK_INK.start,
            top: Math.round(baseline + 0.36 * word - 1),
            width: word * (WORDMARK_INK.end - WORDMARK_INK.start),
            height: 1,
            backgroundColor: BRAND_HEX.signalLo,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The proof badge's glyph for PROVEN (design §5.4: filled vial, M1) as a flat
 * silhouette on the 16 grid: a cap, a one-unit neck, and a tube filled to the
 * top. Square corners, no rounding. (A lip fused to the tube read as a nail
 * at 20px.)
 */
function FilledVial({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path d="M4 1H12V3.5H4ZM5 4.5H11V15H5Z" fill={color} />
    </svg>
  );
}

const pane = (rail: string, background: string): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  paddingLeft: 26,
  paddingRight: 24,
  backgroundColor: background,
  borderLeft: `2px solid ${rail}`,
});

/** "1 passed in 0.42s" with the verb in its execution colour. */
function Result({ text, verb, color }: { text: string; verb: 'passed' | 'failed'; color: string }) {
  const at = text.indexOf(verb);
  const [before, after] = at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + verb.length)];
  return (
    <div style={{ display: 'flex', fontSize: 24, lineHeight: 1.2, color: BRAND_HEX.textBody }}>
      <span style={{ whiteSpace: 'pre' }}>{before}</span>
      {at < 0 ? null : <span style={{ color }}>{verb}</span>}
      <span style={{ whiteSpace: 'pre' }}>{after}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition. The bench's top meets the headline's cap top, and the section
// rule runs from the left margin straight into the bench's HEAD seam, so the
// seam carries across the card (brand-gaps §C draws the two on one row).
// ---------------------------------------------------------------------------
const HEADLINE = { size: 64, lineHeight: 1.02, tracking: -0.032 };
// The seam row is odd (41) so its centred 1px line lands on a whole pixel and
// meets the outer rule exactly.
const BENCH = { left: 704, width: W - EDGE - 704, top: 184, paneA: 120, seam: 41, paneB: 80 };
/** Satori places a GSC baseline 0.84em into a line of line-height 1, plus the half-leading. */
const HEADLINE_CAP_OFFSET = Math.round(((HEADLINE.lineHeight - 1) / 2 + 0.84 - GSC_CAP_HEIGHT) * HEADLINE.size);
const HEADLINE_TOP = BENCH.top - HEADLINE_CAP_OFFSET;
const SEAM_Y = BENCH.top + 1 + BENCH.paneA + (BENCH.seam - 1) / 2; // +1: the bench's top border
const BENCH_BOTTOM = BENCH.top + 2 + BENCH.paneA + BENCH.seam + BENCH.paneB;
const RAIL_TOP = 550;
const SEAM_LINE = FLAT_HEX.rule2OnInk0;

function Bench({ story }: { story: OgStory }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: BENCH.left,
        top: BENCH.top,
        width: BENCH.width,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BRAND_HEX.ink1,
        border: `1px solid ${FLAT_HEX.rule2OnInk0}`,
        borderRadius: 6,
      }}
    >
      <div style={{ ...pane(BRAND_HEX.signalLo, BRAND_HEX.signalTintLo), height: BENCH.paneA, borderTopLeftRadius: 5, borderTopRightRadius: 5 }}>
        <div style={{ display: 'flex', fontSize: 20, lineHeight: 1.2, color: BRAND_HEX.textDim, marginBottom: 12 }}>{`base ${story.baseSha}`}</div>
        <Result text={story.baseResult} verb="passed" color={BRAND_HEX.signalText} />
      </div>
      {/* The seam: its line is the section rule's continuation, edge to edge. */}
      <div style={{ display: 'flex', alignItems: 'center', height: BENCH.seam }}>
        <div style={{ flexGrow: 1, height: 1, backgroundColor: SEAM_LINE }} />
        <div style={{ display: 'flex', fontSize: 20, color: BRAND_HEX.textDim, marginLeft: 16, marginRight: 16 }}>{`HEAD ${story.headSha}`}</div>
        <div style={{ flexGrow: 1, height: 1, backgroundColor: SEAM_LINE }} />
      </div>
      <div style={{ ...pane(BRAND_HEX.alarm, BRAND_HEX.alarmTintLo), height: BENCH.paneB, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }}>
        <Result text={story.headResult} verb="failed" color={BRAND_HEX.alarmText} />
      </div>
    </div>
  );
}

export function OgCard({ story }: { story: OgStory }) {
  return (
    <div style={{ position: 'relative', display: 'flex', width: W, height: H, backgroundColor: BRAND_HEX.ink0, fontFamily: FONT }}>
      <GraphPaper />

      <div style={{ position: 'absolute', left: EDGE, top: EDGE, display: 'flex' }}>
        <LockupB />
      </div>

      <div
        style={{
          position: 'absolute',
          left: EDGE,
          top: HEADLINE_TOP,
          display: 'flex',
          flexDirection: 'column',
          fontSize: HEADLINE.size,
          fontWeight: WEIGHT.display,
          lineHeight: HEADLINE.lineHeight,
          letterSpacing: HEADLINE.tracking * HEADLINE.size,
          color: BRAND_HEX.textPrimary,
        }}
      >
        <div>{"We don't guess."}</div>
        <div>We run the test.</div>
      </div>

      {/* The section rule (motion §4.2.4): a 1px hairline with a tick at its origin, into the seam. */}
      <div style={{ position: 'absolute', left: EDGE, top: SEAM_Y, width: BENCH.left - EDGE + 1, height: 1, backgroundColor: SEAM_LINE }} />
      <div style={{ position: 'absolute', left: EDGE, top: SEAM_Y - 5, width: 1, height: 11, backgroundColor: flattenWhite(0.22, BRAND_HEX.ink0) }} />

      <Bench story={story} />

      <div
        style={{
          position: 'absolute',
          right: EDGE,
          top: BENCH_BOTTOM + 8,
          height: 38,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 14,
          paddingRight: 16,
          backgroundColor: BRAND_HEX.signal,
          borderRadius: 3,
          color: BRAND_HEX.ink0,
          fontSize: 19,
          fontWeight: WEIGHT.wordmark,
          letterSpacing: 19 * 0.08,
        }}
      >
        <FilledVial size={20} color={BRAND_HEX.ink0} />
        <span style={{ marginLeft: 8 }}>PROVEN</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: RAIL_TOP,
          width: W,
          height: H - RAIL_TOP,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: EDGE,
          paddingRight: EDGE,
          backgroundColor: BRAND_HEX.ink2,
          borderTop: `1px solid ${FLAT_HEX.rule1OnInk2}`,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: WEIGHT.display, letterSpacing: 18 * 0.12, color: BRAND_HEX.textBody }}>
          PASSES AT BASE · FAILS AT HEAD · PROVEN
        </div>
        <div style={{ fontSize: 26, fontWeight: WEIGHT.data, color: BRAND_HEX.alarmHi }}>→ blocks merge</div>
      </div>
    </div>
  );
}
