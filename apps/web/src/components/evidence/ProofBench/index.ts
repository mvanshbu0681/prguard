// OWNER: t4 (wave 2). Barrel — the only import path other tracks (and wave 3) should use.
//   import { ProofBench, type ProofBenchProps } from "@/components/evidence/ProofBench";
export { ProofBench } from "./ProofBench";
export type { ProofBenchProps } from "./props";
export {
  CONSEQUENCE_TEXT_CLASS,
  consequence,
  failingPane,
  hasExecution,
  paneBackground,
  paneText,
  paneTone,
  railTone,
  runnerIsolation,
  sha7,
  stateWord,
  verdictLeft,
  type Consequence,
  type ConsequenceTone,
  type PaneTone,
} from "./format";
export { BEATS, HOLD_MS, STAGE, TOTAL_MS, type Stage } from "./timeline";
