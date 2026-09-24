// OWNER: t1a (wave 1).
//
// /lab/t1a — every piece of track t1a in isolation: the substrate, every
// Surface level and variant, the Exhibit (minimal, full, compact, held in its
// hover state), the index and provenance grammar, the gradient border, the
// mark ladder in every tone, the wordmark, the four lockups, the favicon set,
// the GitHub App avatar at 512 and at 20px, the live favicon, and the OG card.
// Marketing-only tokens (grain, glow, gradient border) need data-surface="marketing".
// Sample content is the canonical demo story (plan A10): identifiers from the
// fixture manifest, pytest lines from the same loader the OG card uses. The
// lab types no number an API field would provide.
import manifest from '@fixtures/manifest.json';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { loadOgStory } from '../../../og/data';
import { Lockup, Mark, markForm, Wordmark, type MarkTone } from '@/components/brand';
import {
  Exhibit,
  Grain,
  GraphPaper,
  HeroBackdrop,
  IndexLabel,
  IndexStrip,
  ProvenanceLine,
  ProvenanceStrip,
  SectionIndex,
  Surface,
  type SurfaceElevation,
  type SurfaceVariant,
} from '@/components/chrome';
import { LiveFaviconDemo } from './live-favicon-demo';

export const metadata: Metadata = { title: 'Chrome and brand (lab)' };

const MARK_SIZES = [16, 20, 24, 32, 48, 96] as const;
const TONES: MarkTone[] = ['signal', 'mono', 'ink'];
const ELEVATIONS: SurfaceElevation[] = [0, 1, 2, 3];
const VARIANTS: SurfaceVariant[] = ['panel', 'card', 'inset'];

function LabSection({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-12" aria-labelledby={`lab-${index}`}>
      <SectionIndex index={index} category={title} labelId={`lab-${index}`} labelAs="h2" />
      {note ? <div className="mt-3 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-2 type-data text-text-dim">{children}</p>;
}

const { ids } = manifest;
const story = loadOgStory();
const REVIEW = ids.demo_review_id.slice(0, 7);
const FINDING = ids.proven_finding_id.slice(0, 8);
const PROOF_SOURCE = `GET /v1/reviews/${REVIEW}/result → findings[0].proof`;
const CAPTURED = '2026-09-19T14:22:07Z';

/** "1 passed in 0.42s" with the verb in its execution colour. */
function Result({ text, verb, className }: { text: string; verb: string; className: string }) {
  const at = text.indexOf(verb);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className={className}>{verb}</span>
      {text.slice(at + verb.length)}
    </>
  );
}

function BenchSample() {
  return (
    <div className="type-terminal">
      <div className="border-l-2 border-signal-lo bg-signal-tint-lo px-4 py-2 text-text-body">
        <span className="text-text-dim">$ </span>pytest -q {ids.repro_test_path}
        <br />
        <Result text={story.baseResult} verb="passed" className="text-signal-text" />
      </div>
      <div className="border-l-2 border-alarm bg-alarm-tint-lo px-4 py-2 text-text-body">
        <span className="text-text-dim">$ </span>pytest -q {ids.repro_test_path}
        <br />
        <Result text={story.headResult} verb="failed" className="text-alarm-text" />
      </div>
    </div>
  );
}

const SHAS = `base ${story.baseSha} · head ${story.headSha}`;

export default function T1aLab() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <header className="pb-4">
        <IndexLabel index="lab" category="t1a · chrome and brand" />
        <h1 className="mt-3 type-display-h2 text-text-primary">Chrome, evidence frame, brand</h1>
        <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
          The substrate every surface sits on, the depth model, the one frame that carries registration marks, and THE BENCH mark with
          its lockups and assets. Hover any evidence frame: only its marks and hairline respond.
        </p>
      </header>

      <LabSection
        index="01"
        title="Substrate"
        note="Graph paper at --grid-alpha on each surface, the bounded grain tile, and the full hero stack. Grain ships at 0.035 with overlay blend, one 8-bit step of dither and invisible by design, so the third panel shows the raw tile."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div data-surface="marketing">
            <GraphPaper className="h-40 rounded-panel border border-rule-1 bg-ink-0" />
            <Caption>GraphPaper · marketing · 0.028</Caption>
          </div>
          <div data-surface="app">
            <GraphPaper className="h-40 rounded-panel border border-rule-1 bg-ink-0" />
            <Caption>GraphPaper · dashboard graticule · 0.018</Caption>
          </div>
          <div data-surface="marketing">
            <div className="relative isolate h-40 overflow-hidden rounded-panel border border-rule-1 bg-ink-1">
              <Grain style={{ opacity: 0.35, mixBlendMode: 'normal' }} />
            </div>
            <Caption>Grain · the tile itself, normal blend at 0.35 (lab only; ships at 0.035, overlay)</Caption>
          </div>
        </div>
        <div data-surface="marketing" className="mt-6">
          <HeroBackdrop as="div" className="overflow-hidden rounded-panel border border-rule-1 px-4 py-16 md:px-10">
            <p className="type-label text-signal">Proof by execution · base SHA / head SHA</p>
            <p className="mt-4 type-display-hero text-text-primary">
              {"We don't guess."}
              <br />
              We run the test.
            </p>
          </HeroBackdrop>
          <Caption>HeroBackdrop · ink-0 · graph paper faded at 72% · one static radial · grain beneath the content</Caption>
        </div>
      </LabSection>

      <LabSection
        index="02"
        title="Surface"
        note="One ink rung, a 1px hairline, and inset 0 1px 0 var(--inset-hi) from level 2. No drop shadow anywhere. The last row is interactive (hover class B): each is a link, keyboard-reachable, with the 2px focus ring."
      >
        <GraphPaper className="grid grid-cols-2 gap-3 rounded-panel p-3 md:gap-4 md:p-4 lg:grid-cols-4" data-surface="app">
          {VARIANTS.flatMap((variant) =>
            ELEVATIONS.map((elevation) => (
              <Surface key={`${variant}-${elevation}`} elevation={elevation} variant={variant} className="min-h-20 p-3 md:min-h-24 md:p-4">
                <p className="type-label text-text-dim">
                  {variant} · {elevation}
                </p>
              </Surface>
            )),
          )}
          {ELEVATIONS.map((elevation) => (
            <Surface key={`interactive-${elevation}`} as="a" href="#lab-02" elevation={elevation} interactive className="block min-h-20 p-3 no-underline md:min-h-24 md:p-4">
              <p className="type-label text-text-body">link · {elevation}</p>
            </Surface>
          ))}
        </GraphPaper>
      </LabSection>

      <LabSection
        index="03"
        title="Exhibit"
        note="The evidence frame: index strip, body, provenance strip, and four 8px registration marks at 0.10, rising to 0.22 on hover. The last panel is an ordinary bracketed panel: the same strips, no marks."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Exhibit index="04" category="Repro test" provenance={`GET /v1/findings/${FINDING} → proof.test_file_path`} padded>
              <p className="type-data text-text-primary [overflow-wrap:anywhere]">
                {ids.repro_test_path}
                <span className="text-text-dim">::</span>
                <wbr />
                {ids.failing_test}
              </p>
            </Exhibit>
            <Caption>minimal · no identifier, no meta, provenance without capture time</Caption>
          </div>
          <div>
            <Exhibit index="01" category="Proof bench" identifier={`finding ${FINDING}`} meta={SHAS} provenance={PROOF_SOURCE} capturedAt={CAPTURED}>
              <BenchSample />
            </Exhibit>
            <Caption>full · identifier, meta slot, captured-at</Caption>
          </div>
          <div>
            <Exhibit index="01" category="Proof bench" identifier={`finding ${FINDING}`} provenance={PROOF_SOURCE} capturedAt={CAPTURED} forceHover>
              <BenchSample />
            </Exhibit>
            <Caption>forceHover · marks 0.22, hairline --rule-2, fill unchanged</Caption>
          </div>
          <div>
            <Exhibit index="01" category="Proof" identifier={`finding ${FINDING}`} density="compact" provenance={`${PROOF_SOURCE} · base.excerpt, head.excerpt`} padded>
              <p className="type-data text-text-body">
                base {ids.base_sha.slice(0, 7)} <span className="text-text-dim">·</span> exit 0 <span className="text-text-dim">·</span> head{" "}
                {ids.head_sha.slice(0, 7)} <span className="text-text-dim">·</span> exit 1
              </p>
            </Exhibit>
            <Caption>compact · 24px strip · still an evidence frame (a proof result), never a list of runs</Caption>
          </div>
          <div data-surface="marketing">
            <Exhibit
              index="01"
              category="Proof bench"
              identifier={`finding ${FINDING}`}
              radius="container"
              className="gradient-border"
              provenance={PROOF_SOURCE}
              capturedAt={CAPTURED}
            >
              <BenchSample />
            </Exhibit>
            <Caption>radius container + .gradient-border · the one heavy element</Caption>
          </div>
          <div>
            <Surface elevation={2} className="flex flex-col">
              <IndexStrip index="03" category="Suppressions" />
              <p className="p-4 type-small text-text-body">An ordinary dashboard panel is bracketed but carries no registration marks.</p>
              <ProvenanceStrip source="GET /v1/suppressions?status=active" />
            </Surface>
            <Caption>Surface + IndexStrip + ProvenanceStrip · no marks</Caption>
          </div>
        </div>
      </LabSection>

      <LabSection index="04" title="Index and provenance" note="The index grammar without a frame, for section heads and the nav; the provenance line on its own.">
        <div className="grid gap-6">
          <SectionIndex index="05" category="Computed severity" />
          <SectionIndex index="404" category="No such route" identifier={`/runs/${REVIEW}/pipeline`} />
          <SectionIndex index="02" category="The negation" rule={false} />
          <ProvenanceLine source={PROOF_SOURCE} capturedAt={CAPTURED} />
          <ProvenanceLine source="GET /v1/reviews?limit=8 → items" ext />
        </div>
      </LabSection>

      <LabSection index="05" title="Gradient border" note="Design §4.6: a 1px mask-composite ring, --radius-container. Marketing surface only.">
        <div data-surface="marketing" className="grid gap-6 sm:grid-cols-2">
          <div className="gradient-border bg-ink-1 p-6">
            <p className="type-data text-text-dim">.gradient-border · bare host</p>
          </div>
          <Surface elevation={1} className="gradient-border p-6">
            <p className="type-data text-text-dim">.gradient-border on a Surface · the ring sits on its 1px edge</p>
          </Surface>
        </div>
      </LabSection>

      <LabSection
        index="06"
        title="The mark"
        note="THE BENCH. Size drives the ladder: 32 and up is the full mark; 20 to 31 drops the corner ticks; 19 and under, and every circular crop, is two bars at a 2px stroke. Pixel-snapped at every size."
      >
        <div className="grid gap-4">
          {TONES.map((tone) => (
            <div key={tone} className={tone === 'ink' ? 'rounded-panel bg-text-primary p-4' : 'rounded-panel border border-rule-hair p-4'}>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                {MARK_SIZES.map((size) => (
                  <figure key={size} className="m-0 grid justify-items-start gap-2">
                    <Mark size={size} tone={tone} />
                    <figcaption className={`type-data ${tone === 'ink' ? 'text-ink-5' : 'text-text-dim'}`}>
                      {size} · {markForm(size)}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className={`mt-3 type-label ${tone === 'ink' ? 'text-ink-5' : 'text-text-dim'}`}>tone {tone}</p>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-panel border border-rule-hair p-4">
            {(['running', 'clear', 'blocked'] as const).map((live) => (
              <figure key={live} className="m-0 grid justify-items-start gap-2">
                <Mark size={48} live={live} />
                <figcaption className="type-data text-text-dim">live · {live}</figcaption>
              </figure>
            ))}
            <figure className="m-0 grid justify-items-start gap-2">
              <span className="block rounded-panel bg-ink-3 p-2">
                <span className="block bg-ink-0" style={{ clipPath: 'circle(50%)' }}>
                  <Mark size={96} crop="circle" />
                </span>
              </span>
              <figcaption className="type-data text-text-dim">96 · crop circle</figcaption>
            </figure>
          </div>
        </div>
      </LabSection>

      <LabSection index="07" title="Wordmark and lockups" note="Google Sans Code 560, caps, +0.04em. Lockup A: mark, 1px hairline at cap height, wordmark. B adds the --signal-lo rail at the ink width. C stacks. D is the mark alone.">
        <div className="grid gap-8">
          <div className="flex flex-wrap items-end gap-8">
            {[12, 15, 20].map((size) => (
              <div key={size}>
                <Wordmark size={size} />
                <Caption>{size}px</Caption>
              </div>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(['A', 'B', 'C', 'D'] as const).map((variant) => (
              <div key={variant} className="rounded-panel border border-rule-hair p-6">
                <div className={variant === 'C' ? 'flex justify-center' : 'flex'}>
                  <Lockup variant={variant} />
                </div>
                <Caption>Lockup {variant} · nav</Caption>
              </div>
            ))}
            {(['A', 'B'] as const).map((variant) => (
              <div key={`footer-${variant}`} className="rounded-panel border border-rule-hair p-6">
                <Lockup variant={variant} size="footer" />
                <Caption>Lockup {variant} · footer</Caption>
              </div>
            ))}
            <div className="rounded-panel bg-text-primary p-6">
              <Lockup variant="A" tone="ink" />
              <p className="mt-2 type-data text-ink-5">Lockup A · tone ink</p>
            </div>
            <div className="rounded-panel border border-rule-hair p-6">
              <span className="inline-block outline outline-1 outline-rule-2 outline-dashed">
                <Lockup variant="A" clearSpace />
              </span>
              <Caption>clear space · mark ÷ 6</Caption>
            </div>
          </div>
        </div>
      </LabSection>

      <LabSection index="08" title="Icons and avatar" note="The committed assets. The avatar is circle-cropped by GitHub and must survive 20px: shown on GitHub's light and dark canvases.">
        <div className="grid gap-8">
          <div className="flex flex-wrap items-end gap-8">
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- the committed asset itself, unoptimised */}
              <img src="/icon.svg" width={16} height={16} alt="" className="block" />
              <Caption>icon.svg · 16</Caption>
            </figure>
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" width={64} height={64} alt="" className="block" />
              <Caption>icon.svg · 64</Caption>
            </figure>
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.ico" width={32} height={32} alt="" className="block" style={{ imageRendering: 'pixelated' }} />
              <Caption>favicon.ico · 32</Caption>
            </figure>
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/apple-icon.png" width={90} height={90} alt="" className="block" />
              <Caption>apple-icon.png · 180 at 90</Caption>
            </figure>
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-mask.svg" width={32} height={32} alt="" className="block rounded-data bg-text-primary p-1" />
              <Caption>icon-mask.svg</Caption>
            </figure>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <figure className="m-0 w-full max-w-[512px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/prguard-app-avatar-512.png" width={512} height={512} alt="PRGuard GitHub App avatar" className="block h-auto w-full border border-rule-1" />
              <Caption>prguard-app-avatar-512.png</Caption>
            </figure>
            {[
              ['light', 'bg-[#FFFFFF]'],
              ['dark', 'bg-[#0D1117]'],
            ].map(([theme, canvas]) => (
              <figure key={theme} className="m-0">
                <div className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-data px-3 ${canvas}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/prguard-app-avatar-512.png" width={20} height={20} alt="" className="block" style={{ clipPath: 'circle(50%)' }} />
                  <span className={`font-prose text-[13px] ${theme === 'light' ? 'text-[#1F2328]' : 'text-[#E6EDF3]'}`}>prguard[bot] reviewed</span>
                </div>
                <Caption>20px · GitHub {theme}</Caption>
              </figure>
            ))}
          </div>
        </div>
      </LabSection>

      <LabSection index="09" title="Live favicon" note="useLiveFavicon swaps link[rel=icon] to a runtime-drawn 32x32 frame and restores it on unmount. Running ticks at the 1200ms heartbeat; under reduced motion it is drawn once. Press R, C, B or O.">
        <LiveFaviconDemo />
      </LabSection>

      <LabSection index="10" title="OG card" note="app/opengraph-image.tsx, 1200 x 630, rendered by next/og from flat hex and static font instances.">
        {/* eslint-disable-next-line @next/next/no-img-element -- the generated route itself */}
        <img src="/opengraph-image" width={1200} height={630} alt="The PRGuard social card" className="block h-auto w-full rounded-panel border border-rule-1" />
      </LabSection>
    </div>
  );
}
