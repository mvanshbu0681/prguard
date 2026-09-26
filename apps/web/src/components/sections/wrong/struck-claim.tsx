// OWNER: m2 (wave 3). The struck claim (landing-blueprint §03 "Copy" — "The
// struck claim"): the demo disproven finding's own title, line-through, with
// the ProofChip's own fixed caption underneath. `claim` and `caption` are
// both data (Finding.title, PROOF_CHIP.disproven.caption via <ProofChip
// caption>), never invented copy — the finding this renders is whichever one
// @/lib/fixtures#getDemoDisprovenFinding() returns.
import { ProofChip } from "@/components/badges";

export function StruckClaim({ claim }: { claim: string }) {
  return (
    <div className="reveal flex flex-col gap-2" data-anim>
      <p className="border-b border-rule-1 pb-3 font-mono text-[13px] leading-[1.5] text-text-dim line-through decoration-1">{claim}</p>
      <ProofChip status="disproven" caption />
    </div>
  );
}
