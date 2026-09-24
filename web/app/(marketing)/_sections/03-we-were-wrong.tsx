// OWNER: m2 (wave 3). Section 03 of 9 (plan T8) — WE WERE WRONG
// (docs/design/03-landing-blueprint.md §03; brand-gaps §2 ruling 3 fold; §D
// voice; plan §13 A6/A7). Occupies the slot every competitor fills with a
// customer logo wall: the system publicly refuting its own finding, before
// the visitor is asked to believe anything else. Also folds in what would
// have been a standalone §04 proof-state legend (blueprint §4 cut-order
// item 3 — this build never ships that 560px section).
//
// Server component: every identifier, SHA, claim and number below is read
// from the fixture corpus at render time (@/lib/fixtures, server-only) and
// passed down as plain props — nothing here is a literal an API/fixture field
// would otherwise supply (plan A7). The frozen app/(marketing)/page.tsx
// imports the named export `WeWereWrong`; the section id `wrong` is a
// nav/footer deep-link target.
import { SectionIndex, Surface } from "@/components/chrome";
import { ProofBench } from "@/components/evidence/ProofBench";
import { MetricReadout } from "@/components/sections/wrong/metric-readout";
import { ProofStateLegend } from "@/components/sections/wrong/proof-state-legend";
import { StruckClaim } from "@/components/sections/wrong/struck-claim";
import { getAccuracy, getDemoDisprovenFinding, getManifest } from "@/lib/fixtures";
import type { Finding, FindingProof } from "@/lib/api-types";

/** Every demo finding in the corpus carries a proof; Finding.proof is nullable in the
 *  generated schema, so this fails loudly instead of silently rendering an empty bench
 *  if that ever stops being true (same guard as app/(lab)/lab/t4, wave 2). */
function requireProof(finding: Finding): FindingProof {
  if (!finding.proof) throw new Error(`finding ${finding.id} has no proof in the fixture corpus`);
  return finding.proof;
}

export function WeWereWrong() {
  const { ids } = getManifest();
  const disproven = getDemoDisprovenFinding();
  const proof = requireProof(disproven);
  const accuracy = getAccuracy();
  const metric = accuracy.precision_proxies.self_caught_false_positive_rate;
  const findingShort = disproven.id.slice(0, 8);

  return (
    <section id="wrong" className="border-b border-rule-hair bg-ink-0 px-4 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-x-12 gap-y-12 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-6">
          <div className="flex flex-col gap-4">
            <SectionIndex index="03" category="Self-refutation" />
            <h2 className="type-display-h2 text-balance text-text-primary">We were wrong about this one.</h2>
            <div className="flex max-w-(--measure-body) flex-col gap-3 type-body text-text-body">
              <p>
                PRGuard flagged a correctness issue in the billing path — reachable, untested, on a currency the rate table does not carry. It
                wrote a repro test. The sandbox ran it at the head SHA.
              </p>
              <p>
                It passed. The finding&apos;s <code className="font-mono text-text-body">proof_status</code> was set to{" "}
                <code className="font-mono text-text-body">disproven</code>, and it never reached the pull request.
              </p>
            </div>
          </div>

          <StruckClaim claim={disproven.title} />

          <Surface elevation={1} variant="inset" className="flex flex-col gap-3 px-4 py-4">
            <p className="type-body text-text-body">
              That is the rate at which the system caught itself before the claim reached your pull request. The alternative is a tool with the
              same rate that does not tell you.
            </p>
            <MetricReadout name="self_caught_false_positive_rate" metric={metric} />
          </Surface>

          <a
            href="#accuracy"
            className="link-draw w-fit type-label"
            style={{ "--link-fg": "var(--signal-text)", "--link-fg-hover": "var(--signal-hi)" } as React.CSSProperties}
          >
            ALL SIX METRICS, WITH DEFINITIONS, SAMPLE SIZES AND CAVEATS →
          </a>

          <div className="flex flex-col gap-4 border-t border-rule-1 pt-8">
            <p className="type-label text-text-dim">/ FOUR PROOF STATES</p>
            <ProofStateLegend />
          </div>
        </div>

        <div className="lg:col-span-6">
          <ProofBench
            proof={proof}
            density="compact"
            mode="static"
            findingId={disproven.id}
            baseSha={ids.base_sha}
            headSha={ids.head_sha}
            blocking={disproven.blocking}
            index="03"
            provenance={`GET /v1/findings/${findingShort} → proof`}
            capturedAt={disproven.created_at}
          />
        </div>
      </div>
    </section>
  );
}
