// A ledger row's state — active / expired / revoked — as a kit Tag, carried by
// shape as well as colour: a live dot for active, a dashed outline for expired,
// a struck label for revoked (colour is never the only channel).
import { Tag } from "@/components/dash/kit";
import type { LedgerState } from "./format";

export interface LedgerStateChipProps {
  state: LedgerState;
  size?: "sm" | "md";
  className?: string;
}

const LABEL: Record<LedgerState, string> = { active: "Active", expired: "Expired", revoked: "Revoked" };

export function LedgerStateChip({ state, size = "md", className }: LedgerStateChipProps) {
  return (
    <span data-ledger-state={state} className={className}>
      {state === "active" ? (
        <Tag tone="ok" size={size} dot>
          {LABEL.active}
        </Tag>
      ) : state === "expired" ? (
        <Tag tone="dashed" size={size}>
          {LABEL.expired}
        </Tag>
      ) : (
        <Tag tone="outline" size={size} strike>
          {LABEL.revoked}
        </Tag>
      )}
    </span>
  );
}
