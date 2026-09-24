"use client";
// OWNER: m1 (wave 3). The hero's right column: a single <ProofBench> that P/D key
// swaps between the demo corpus's proven finding and its disproven counter-demo
// (landing-blueprint §01 "the bench", motion §4.6.1/§4.6.3, brief "THE D KEY").
//
// ProofBench (wave 2, src/components/evidence/ProofBench) has no imperative replay
// handle, and its own `replayKey` only restarts ITS current props — it cannot swap
// which finding it is showing. So this file does the swap itself: pressing "p" (or
// its published alias "r" — motion-spec §4.6.1) or "d" changes which finding's data
// is passed down and bumps a nonce, and both are baked into this <ProofBench>'s
// React `key`. A changed `key` unmounts the old instance and mounts a fresh one
// with `autoplay="mount"`, which is exactly ProofBench's own "play once after
// document.fonts.ready" path (src/motion/autoplay.ts) — so "re-keying" the bench
// IS the replay, frame-identical every time, and under reduced motion autoplay
// does nothing and the static end frame stands (design §0 rule 1; motion spec §5),
// which is the required reduced-motion behaviour for P/R/D too.
//
// No `replayKey` prop is passed to <ProofBench>: that would bind a SECOND window
// keydown listener (useSequence -> useKeyBinding) racing this file's own, restarting
// the about-to-unmount instance's stale animation a frame before the remount lands.
// This file is the only "p"/"r"/"d" listener the hero ever has.
import { useEffect, useState } from "react";
import { ProofBench } from "@/components/evidence/ProofBench";
import type { FindingProof } from "@/lib/api-types";
import { shouldHandleKey } from "@/motion/keys";

export interface HeroBenchFinding {
  proof: FindingProof;
  findingId: string;
  baseSha: string;
  headSha: string;
  blocking: boolean;
  /** Only the disproven counter-demo renders a claim (it is the thing struck through). */
  claim?: string;
  provenance: string;
  capturedAt: string;
}

export interface HeroBenchProps {
  proven: HeroBenchFinding;
  disproven: HeroBenchFinding;
  className?: string;
}

type Which = "proven" | "disproven";

function announcement(which: Which, data: HeroBenchFinding): string {
  return `Proof bench: finding ${data.findingId.slice(0, 8)}, proof_status: ${data.proof.status}${which === "disproven" ? " — refuted by execution" : ""}.`;
}

export function HeroBench({ proven, disproven, className }: HeroBenchProps) {
  const [state, setState] = useState<{ which: Which; nonce: number }>({ which: "proven", nonce: 0 });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // motion-spec §4.6.1: "R key | alias for P ... both are bound" — R replays
      // the bench exactly as P does (return to the proven finding and replay).
      if (shouldHandleKey(event, ["p", "r"])) {
        event.preventDefault();
        setState((s) => ({ which: "proven", nonce: s.nonce + 1 }));
      } else if (shouldHandleKey(event, "d")) {
        event.preventDefault();
        setState((s) => ({ which: s.which === "disproven" ? "proven" : "disproven", nonce: s.nonce + 1 }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const data = state.which === "proven" ? proven : disproven;

  return (
    <div className={className}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement(state.which, data)}
      </p>
      <ProofBench
        key={`${state.which}-${state.nonce}`}
        proof={data.proof}
        density="detail"
        mode="replay"
        autoplay="mount"
        findingId={data.findingId}
        baseSha={data.baseSha}
        headSha={data.headSha}
        blocking={data.blocking}
        claim={state.which === "disproven" ? data.claim : undefined}
        index="01"
        provenance={data.provenance}
        capturedAt={data.capturedAt}
      />
    </div>
  );
}
