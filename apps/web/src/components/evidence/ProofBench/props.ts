// OWNER: t4 (wave 2). ProofBench's own prop surface: the frozen base
// (src/components/evidence/props.ts, owner t1a) extended locally, exactly as plan §8 and
// the track brief allow ("a wave-2 builder blocked on a missing field adds it to their own
// local type and files it — they do not edit the frozen file"). Raised: `replayKey` and
// `autoplay` are not on the frozen base; both are additive and optional.
import type { ProofBenchProps as BaseProofBenchProps } from "@/components/evidence/props";

export type { AuditEvent, FindingProof } from "@/components/evidence/props";
export type { ProofExecution } from "@/lib/api-types";

export interface ProofBenchProps extends BaseProofBenchProps {
  /**
   * Key that restarts the replay (e.g. "p" on the hero's proven bench, "d" on its
   * disproven counter-demo). Two ProofBench instances on one page bind two different
   * keys; each instance only answers its own. Ignored while typing (src/motion/keys.ts).
   */
  replayKey?: string;
  /** When to start the replay once mounted. Default "none": nothing plays without a key
   *  press or an explicit `play()` call from the caller's own control. */
  autoplay?: "none" | "mount" | "in-view";
}
