// OWNER: d4 (wave 3). The ledger's per-row state — active / expired / revoked — carried
// by shape as well as colour (design accessibility rule: colour is never the only
// channel; brand-gaps §2.0 "forced colors" restores every glyph). `revoked` reuses the
// exact glyph t1c drew for a suppressed finding (LedgerGlyph — "a suppressed finding
// stays on the record"), because that is precisely this row's own claim.
import { LedgerGlyph } from "@/components/icons";
import type { LedgerState } from "./format";
import { cn } from "@/lib/utils";

export interface LedgerStateChipProps {
  state: LedgerState;
  className?: string;
}

const LABEL: Record<LedgerState, string> = { active: "ACTIVE", expired: "EXPIRED", revoked: "REVOKED" };

export function LedgerStateChip({ state, className }: LedgerStateChipProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 type-label", state === "active" ? "text-text-body" : "text-text-dim", className)} data-ledger-state={state}>
      {state === "active" ? (
        <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-signal-lo" />
      ) : state === "expired" ? (
        <span aria-hidden className="size-[7px] shrink-0 rounded-full border border-rule-3" />
      ) : (
        <LedgerGlyph size={12} className="shrink-0" />
      )}
      {LABEL[state]}
    </span>
  );
}
