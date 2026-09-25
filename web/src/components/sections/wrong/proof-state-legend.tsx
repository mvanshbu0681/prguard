// OWNER: m2 (wave 3). The proof-state legend, folded into §03 per
// landing-blueprint §4 "CUT ORDER UNDER PRESSURE" item 3 ("fold section 04's
// proof-state legend into section 03") — this build never ships a standalone
// §04, so the four states live here as compact chips instead of a 560px
// section. Copy: §04's own four-row table (blueprint §04 "The four chips"),
// condensed to one line each per the track brief.
//
// <ProofChip> (@/components/badges) already carries the mandatory glyph and
// the fill/outline encoding (design §1.7) — colour is never the only channel.
import { ProofChip } from "@/components/badges";
import type { ProofStatus } from "@/lib/contracts";

const STATES: { status: ProofStatus; caption: string }[] = [
  { status: "proven", caption: "The test passes at base and fails at head. The only status that can block a merge." },
  { status: "disproven", caption: "The test also passes at head. Refuted by execution before it was ever published." },
  { status: "inconclusive", caption: "The sandbox could not settle it — no runner, a flaky test, a timeout. Needs a human." },
  { status: "not_attempted", caption: "No repro was generated. Advisory only; it cannot block." },
];

export function ProofStateLegend() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {STATES.map(({ status, caption }) => (
          <li key={status} className="reveal flex flex-wrap items-baseline gap-x-3 gap-y-1" data-anim>
            <ProofChip status={status} />
            <span className="type-small text-text-body">{caption}</span>
          </li>
        ))}
      </ul>
      <p className="reveal max-w-(--measure-body) type-small text-text-dim" data-anim>
        Proven and disproven share the cyan hue on purpose: both are the sandbox&apos;s own result, not an opinion — fill versus outline, and the
        label, carry the difference. Inconclusive and not attempted never reached a verdict, so neither wears the signal colour.
      </p>
    </div>
  );
}
