// OWNER: m1 (wave 3). Section 01 of 9 (plan T8) — THE SIGNATURE MOMENT
// (landing-blueprint §01, §2, §7; motion §4.6; brand-gaps §2 rulings 3, 11, §D;
// plan §13 A5, A7, A10). Keep the named export and the section id — the frozen
// app/(marketing)/page.tsx imports Hero, and "#proof" is the nav/footer deep-link
// target (src/components/marketing-shell/sections.ts).
//
// SERVER component: every number and identifier below is read from the fixture
// corpus (@/lib/fixtures, server-only) at build time and passed down as plain
// props — nothing here is typed in as a literal a fixture or API field already
// provides (plan A7). The static frame (eyebrow, H1, subhead, CTAs, calibration
// strip, and the bench in its fully-lit end state) is complete HTML at first
// paint; only the bench's replay and its P/D swap need a client boundary
// (<HeroBench>, src/components/sections/hero/HeroBench.tsx) — everything else
// here stays server-rendered.
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { formatScore } from "@/components/badges";
import { HeroBackdrop } from "@/components/chrome";
import type { Finding, FindingProof } from "@/lib/api-types";
import { getAccuracy, getDemoDisprovenFinding, getDemoProvenFinding, getManifest } from "@/lib/fixtures";
import { HeroBench, type HeroBenchFinding } from "@/components/sections/hero/HeroBench";

/** Finding.proof is nullable in the generated schema; the demo corpus's proven and
 *  disproven findings both carry one (verified against the fixture corpus — see
 *  app/(lab)/lab/t4's identical guard). Fails loudly rather than rendering an
 *  empty bench if that ever stops being true. */
function requireProof(finding: Finding): FindingProof {
  if (!finding.proof) throw new Error(`finding ${finding.id} has no proof in the fixture corpus`);
  return finding.proof;
}

// design §01 "reads as there is more product than fits here": the panel fades out
// toward its own bottom edge. A percentage-of-box stop (the blueprint's literal
// "0% 78% 100%") only lands where intended if the box is exactly as tall as its
// content — forcing a fixed min-height (as this used to) instead leaves a blank
// graph-paper gap below the real content and moves the fade past everything
// visible. The bench's last two children are the verdict rail (44px, "NEVER
// CUT" — design §01 line 324) and, below it, the Exhibit's own provenance strip
// (prg-strip[data-strip="provenance"], min-height 24px, src/styles/chrome.css).
// A fixed pixel offset from the bottom — sized to sit inside that provenance
// strip — fades only that trailing line, on the box's own intrinsic (auto)
// height, so the verdict rail always stays fully opaque and no space is added
// past the bench's real content, at any viewport width or for either finding
// (the disproven state's extra claim line just shifts the whole fade down with it).
const CALIBRATION_MASK_CSS = `
@media (min-width: 1024px) {
  .hero-bench-bleed {
    mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 20px), transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 20px), transparent 100%);
  }
}`;

export function Hero() {
  const manifest = getManifest();
  const { base_sha: baseSha, head_sha: headSha, demo_review_id: reviewId } = manifest.ids;
  const review7 = reviewId.slice(0, 7);

  const provenFinding = getDemoProvenFinding();
  const disprovenFinding = getDemoDisprovenFinding();

  const proven: HeroBenchFinding = {
    proof: requireProof(provenFinding),
    findingId: provenFinding.id,
    baseSha,
    headSha,
    blocking: provenFinding.blocking ?? false,
    provenance: `GET /v1/reviews/${review7}/result → findings[0].proof`,
    capturedAt: provenFinding.created_at,
  };
  const disproven: HeroBenchFinding = {
    proof: requireProof(disprovenFinding),
    findingId: disprovenFinding.id,
    baseSha,
    headSha,
    blocking: disprovenFinding.blocking ?? false,
    claim: disprovenFinding.title,
    provenance: `GET /v1/findings/${disprovenFinding.id.slice(0, 8)} → proof`,
    capturedAt: disprovenFinding.created_at,
  };

  const { precision_proxies } = getAccuracy();
  const calibration = [
    { name: "execution-verified precision", metric: precision_proxies.execution_verified_precision },
    { name: "self-caught false positives", metric: precision_proxies.self_caught_false_positive_rate },
    { name: "human dismissal", metric: precision_proxies.human_dismissal_rate },
  ];

  return (
    <HeroBackdrop id="proof" className="relative isolate border-b border-rule-1">
      <style>{CALIBRATION_MASK_CSS}</style>
      <div className="relative z-10 flex flex-col gap-14 pt-24 pb-16 md:pt-28 md:pb-20 lg:flex-row lg:items-start lg:gap-10 lg:pt-32 lg:pb-24">
        {/* LEFT COLUMN */}
        <div className="px-4 md:px-8 lg:w-[600px] lg:shrink-0 lg:pt-6 lg:pl-[max(32px,calc((100vw-1200px)/2+32px))]">
          <p className="type-label text-text-dim">/ 01 — THE PROOF BENCH</p>
          <p className="mt-3 type-label text-signal">PROOF BY EXECUTION · BASE SHA / HEAD SHA</p>

          <h1 className="mt-4 text-balance type-display-hero text-text-primary">
            {"We don't guess."}
            <br />
            We run the test.
          </h1>

          <p className="mt-6 max-w-[58ch] type-lead text-text-body">
            PRGuard writes a repro test, executes it in a sandboxed container at your pull request&rsquo;s base SHA and at its head SHA, and
            attaches the real terminal output. Only proven findings can block a merge.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild variant="primary">
              <a href="#run">RUN A REVIEW →</a>
            </Button>
            <Button asChild variant="ghost">
              <a href="#accuracy">READ THE ACCURACY REPORT</a>
            </Button>
          </div>

          <p className="mt-4 font-mono text-[11px] text-text-dim">
            press <Kbd>P</Kbd> to replay · <Kbd>D</Kbd> for a finding we refuted
          </p>

          <div className="mt-10 border-y border-rule-1 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-2">
              {calibration.map(({ name, metric }, i) => (
                <span key={name} className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
                  <span className="text-text-dim">{name}</span>
                  <span className="tabular text-text-body">
                    {formatScore(metric.value ?? Number.NaN)} <span className="text-text-dim">(n={metric.n ?? 0})</span>
                  </span>
                  {i < calibration.length - 1 ? (
                    <span aria-hidden="true" className="hidden text-text-dim sm:inline">
                      ·
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-text-dim">GET /v1/accuracy</p>
          </div>
        </div>

        {/* RIGHT COLUMN — the bench, flush to the viewport's right edge at lg+ */}
        <div className="hero-bench-bleed min-w-0 px-4 md:px-8 lg:flex-1 lg:px-0">
          <HeroBench proven={proven} disproven={disproven} />
        </div>
      </div>
    </HeroBackdrop>
  );
}
