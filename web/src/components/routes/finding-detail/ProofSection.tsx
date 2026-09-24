// OWNER: d3 (wave 3). §04 — PROOF (dashboard-blueprint §2.7, §3b).
// <ProofBench density="compact" mode="static"> plus the command, runner,
// isolation, baseline_mode, duration and deps_install_ok the bench itself
// does not print. ProofBench wraps itself in <Exhibit>; the metadata row
// below it stays inside the same visual block but outside that frame — it
// is a fact sheet about the capture, not the capture itself.
import { ProofBench } from "@/components/evidence/ProofBench";
import type { Finding } from "@/lib/api-types";
import { formatDurationMs } from "./format";

const META_LABEL = "type-label text-text-dim";
const META_VALUE = "type-data break-words text-text-body";

export function ProofSection({ finding, baseSha, headSha, reviewShort }: { finding: Finding; baseSha: string | null; headSha: string | null; reviewShort: string }) {
  const proof = finding.proof;
  if (!proof) {
    return (
      <section aria-labelledby="fd-04" className="rounded-panel border border-rule-1 bg-ink-2 px-4 py-5 md:px-6">
        <h2 id="fd-04" className="type-label text-text-dim">
          / 04 — PROOF
        </h2>
        <p className="mt-3 type-body text-text-body">No proof was attached to this finding.</p>
      </section>
    );
  }
  const duration = formatDurationMs(proof.duration_ms);
  return (
    <div className="flex flex-col gap-4">
      <ProofBench
        proof={proof}
        density="compact"
        mode="static"
        findingId={finding.id}
        baseSha={baseSha}
        headSha={headSha}
        blocking={finding.blocking}
        claim={finding.title}
        index="04"
        provenance={`GET /v1/reviews/${reviewShort}/result → findings[].proof`}
        capturedAt={finding.created_at}
      />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-panel border border-rule-1 bg-ink-1 px-4 py-4 sm:grid-cols-3 md:px-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Command</span>
          <span className={`${META_VALUE} break-all`}>{proof.command ?? "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Runner</span>
          <span className={META_VALUE}>{proof.runner ?? "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Isolation</span>
          <span className={META_VALUE}>{proof.isolation ?? "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Baseline mode</span>
          <span className={META_VALUE}>{proof.baseline_mode ?? "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Duration</span>
          <span className={META_VALUE}>{duration ?? "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={META_LABEL}>Deps install ok</span>
          <span className={META_VALUE}>{proof.deps_install_ok === null || proof.deps_install_ok === undefined ? "—" : proof.deps_install_ok ? "yes" : "no"}</span>
        </div>
      </dl>
    </div>
  );
}
