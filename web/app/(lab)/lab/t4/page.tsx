// OWNER: t4 (wave 2). /lab/t4 — <ProofBench> in isolation: every proof_status, both
// densities, both modes, and the "p" / "d" replay bindings on the two evidence-bearing
// findings the demo corpus carries (plan A10, A14).
//
// Server component: fixtures load here (server-only) and the resolved data passes down as
// props to the client <ProofBench>. Identifiers, SHAs and timestamps below are ALL read from
// the fixture corpus — nothing here is a literal an API field would otherwise provide.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProofBench } from "@/components/evidence/ProofBench";
import { getDemoDisprovenFinding, getDemoInconclusiveFinding, getDemoProvenFinding, getFinding, getManifest } from "@/lib/fixtures";
import type { Finding, FindingProof } from "@/lib/api-types";

export const metadata: Metadata = { title: "Proof Bench (lab)" };

const manifest = getManifest();
const { base_sha: BASE_SHA, head_sha: HEAD_SHA, demo_review_id: REVIEW_ID } = manifest.ids;
const REVIEW7 = REVIEW_ID.slice(0, 8);

// RAISED: manifest.json (t2b, wave 1) carries `ids.not_attempted_finding_id`, but the
// frozen `DemoIds` type (src/lib/fixture-types.ts, t2a) does not declare it — a wave-1
// type/data gap. Worked around locally rather than editing the frozen file (plan §8).
const NOT_ATTEMPTED_ID = (manifest.ids as unknown as { not_attempted_finding_id?: string }).not_attempted_finding_id;

/** Every demo finding in this lab carries a proof (verified against the fixture corpus);
 *  Finding.proof is nullable in the generated schema, so this fails loudly instead of
 *  silently rendering an empty bench if that ever stops being true. */
function requireProof(finding: Finding): FindingProof {
  if (!finding.proof) throw new Error(`finding ${finding.id} has no proof in the fixture corpus`);
  return finding.proof;
}

const PROVEN = getDemoProvenFinding();
const DISPROVEN = getDemoDisprovenFinding();
const INCONCLUSIVE = getDemoInconclusiveFinding();
const NOT_ATTEMPTED = NOT_ATTEMPTED_ID ? getFinding(NOT_ATTEMPTED_ID) : null;

function provenanceFor(findingId: string): string {
  return `GET /v1/findings/${findingId.slice(0, 8)} → proof`;
}

function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 py-10" aria-labelledby={`s-${index}`}>
      <h2 id={`s-${index}`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

const PAPER = {
  backgroundImage: [
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 8px)",
    "repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px 64px)",
    "repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px 64px)",
  ].join(", "),
} as const;

export default function ProofBenchLab() {
  return (
    <div data-surface="app" className="min-h-dvh" style={PAPER}>
      <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-8">
        <header>
          <p className="type-label text-text-dim">/ lab — t4 · proof bench</p>
          <h1 className="mt-3 type-display-h3 text-text-primary">Proof Bench</h1>
          <p className="mt-3 max-w-(--measure-body) type-body text-text-body">
            A finding&apos;s repro test, executed at the base SHA and at the head SHA, shown as evidence. Press <code className="font-mono">p</code> to
            replay the proven bench below, <code className="font-mono">d</code> to replay the disproven counter-demo.
          </p>
        </header>

        <Section
          index="01"
          title="proof_status: proven · density=detail · mode=replay"
          note={
            <>
              The signature moment: the repro test passes at base <code className="font-mono">{BASE_SHA.slice(0, 7)}</code> and fails at head{" "}
              <code className="font-mono">{HEAD_SHA.slice(0, 7)}</code>. Autoplays once on mount; <code className="font-mono">p</code> replays it.
            </>
          }
        >
          <ProofBench
            proof={requireProof(PROVEN)}
            density="detail"
            mode="replay"
            replayKey="p"
            autoplay="mount"
            findingId={PROVEN.id}
            baseSha={BASE_SHA}
            headSha={HEAD_SHA}
            blocking={PROVEN.blocking}
            index="01"
            provenance={provenanceFor(PROVEN.id)}
            capturedAt={PROVEN.created_at}
          />
        </Section>

        <Section
          index="02"
          title="proof_status: disproven · density=detail · mode=replay"
          note={
            <>
              The counter-demo (motion spec §4.6.3): the repro also passes at head, so the finding refutes itself before it ever reaches a pull
              request. Press <code className="font-mono">d</code> to replay.
            </>
          }
        >
          <ProofBench
            proof={requireProof(DISPROVEN)}
            density="detail"
            mode="replay"
            replayKey="d"
            autoplay="none"
            findingId={DISPROVEN.id}
            baseSha={BASE_SHA}
            headSha={HEAD_SHA}
            blocking={DISPROVEN.blocking}
            claim={DISPROVEN.title}
            index="02"
            provenance={provenanceFor(DISPROVEN.id)}
            capturedAt={DISPROVEN.created_at}
          />
        </Section>

        <Section index="03" title="proof_status: inconclusive · density=detail · mode=static">
          <ProofBench
            proof={requireProof(INCONCLUSIVE)}
            density="detail"
            mode="static"
            findingId={INCONCLUSIVE.id}
            baseSha={BASE_SHA}
            headSha={HEAD_SHA}
            blocking={INCONCLUSIVE.blocking}
            index="03"
            provenance={provenanceFor(INCONCLUSIVE.id)}
            capturedAt={INCONCLUSIVE.created_at}
          />
        </Section>

        <Section
          index="04"
          title="proof_status: not_attempted · density=detail · mode=static"
          note="No base/head execution to show: the bench renders its frame with the reason, not an absence."
        >
          {NOT_ATTEMPTED ? (
            <ProofBench
              proof={requireProof(NOT_ATTEMPTED)}
              density="detail"
              mode="static"
              findingId={NOT_ATTEMPTED.id}
              blocking={NOT_ATTEMPTED.blocking}
              index="04"
              provenance={provenanceFor(NOT_ATTEMPTED.id)}
              capturedAt={NOT_ATTEMPTED.created_at}
            />
          ) : (
            <p className="type-body text-alarm-text">manifest ids.not_attempted_finding_id has no matching finding in the corpus.</p>
          )}
        </Section>

        <Section index="05" title="density=compact · mode=static — the dashboard's §04 PROOF section">
          <div className="grid gap-8 lg:grid-cols-2">
            <ProofBench
              proof={requireProof(PROVEN)}
              density="compact"
              mode="static"
              findingId={PROVEN.id}
              baseSha={BASE_SHA}
              headSha={HEAD_SHA}
              blocking={PROVEN.blocking}
              index="04"
              provenance={`GET /v1/reviews/${REVIEW7}/result → findings[0].proof`}
              capturedAt={PROVEN.created_at}
            />
            <ProofBench
              proof={requireProof(DISPROVEN)}
              density="compact"
              mode="static"
              findingId={DISPROVEN.id}
              baseSha={BASE_SHA}
              headSha={HEAD_SHA}
              blocking={DISPROVEN.blocking}
              claim={DISPROVEN.title}
              index="04"
              provenance={provenanceFor(DISPROVEN.id)}
              capturedAt={DISPROVEN.created_at}
            />
            <ProofBench
              proof={requireProof(INCONCLUSIVE)}
              density="compact"
              mode="static"
              findingId={INCONCLUSIVE.id}
              baseSha={BASE_SHA}
              headSha={HEAD_SHA}
              blocking={INCONCLUSIVE.blocking}
              index="04"
              provenance={provenanceFor(INCONCLUSIVE.id)}
              capturedAt={INCONCLUSIVE.created_at}
            />
            {NOT_ATTEMPTED ? (
              <ProofBench
                proof={requireProof(NOT_ATTEMPTED)}
                density="compact"
                mode="static"
                findingId={NOT_ATTEMPTED.id}
                blocking={NOT_ATTEMPTED.blocking}
                index="04"
                provenance={provenanceFor(NOT_ATTEMPTED.id)}
                capturedAt={NOT_ATTEMPTED.created_at}
              />
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
