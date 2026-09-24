// OWNER: t1c (wave 1). Every value of every enum the chips encode, in display order.
// The keys of the spec maps are the source, so a value added to a map shows up here.
import { DELIVERY_MODE, FINDING_STATUS, PROOF_CHIP, STAGE_DOT_COLOR, type GateReading } from "@/components/badges";
import type { DeliveryMode, FindingStatus, ProofStatus, StageState } from "@/lib/contracts";

export const PROOF_STATUSES = Object.keys(PROOF_CHIP) as ProofStatus[];
export const FINDING_STATUSES = Object.keys(FINDING_STATUS) as FindingStatus[];
export const STAGE_STATES = Object.keys(STAGE_DOT_COLOR) as StageState[];
export const DELIVERY_MODES = Object.keys(DELIVERY_MODE) as DeliveryMode[];
export const GATE_READINGS: GateReading[] = ["failure", "neutral", "success", null];
