// OWNER: m4 (wave 3). Pure logic behind section 06's gate ladder (landing
// blueprint §06). GATE_DELIVERIES (frozen, @/lib/contracts) fixes the rung
// order; which one fired comes from GateInfo.delivery — never a typed literal.
import { GATE_DELIVERIES, type GateDelivery } from "@/lib/contracts";

export interface GateRung {
  delivery: GateDelivery;
  fired: boolean;
}

/** Three rows, GATE_DELIVERIES order, with the one matching `fired` marked. */
export function gateLadder(fired: GateDelivery | null | undefined): GateRung[] {
  return GATE_DELIVERIES.map((delivery) => ({ delivery, fired: delivery === fired }));
}
