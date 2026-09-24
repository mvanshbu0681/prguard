// OWNER: m4 (wave 3). The gate ladder — landing blueprint §06's
// "check_run / commit_status / dry_run". No checkmark: the rung that fired
// reads solid (--text-primary + the word "fired"); the other two read ghosted
// (--text-dim + an em dash) — position and weight carry the state, not colour
// or an icon (hard rule: no pass-checkmarks; design R1: colour is never the
// only channel).
import { cn } from "@/lib/utils";
import type { GateDelivery } from "@/lib/contracts";
import { gateLadder } from "./gate-ladder";

export interface GateLadderProps {
  fired: GateDelivery | null | undefined;
  className?: string;
}

export function GateLadder({ fired, className }: GateLadderProps) {
  const rungs = gateLadder(fired);
  return (
    <dl className={cn("grid gap-1.5 type-data text-[13px]", className)}>
      {rungs.map((rung) => (
        <div key={rung.delivery} className="flex items-baseline gap-x-3">
          <dt className={cn("w-[8.5em] shrink-0", rung.fired ? "text-text-primary" : "text-text-dim")}>{rung.delivery}</dt>
          <dd className={rung.fired ? "text-text-primary" : "text-text-dim"}>{rung.fired ? "fired" : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
