// OWNER: m4 (wave 3). The S8 delivery ladder — landing blueprint §06's
// "inline_exact / inline_nearest / file_level / summary_only, N silently
// dropped". Plain server-rendered text: no checkmark glyph (hard rule: no
// pass-checkmarks) — presence reads by the printed count itself, absence by an
// em dash, exactly like <DeliveryModeChip>'s own not_delivered treatment.
import { cn } from "@/lib/utils";
import type { Finding, LadderBreakdown, ResultCounts } from "@/lib/api-types";
import { deliveryLadder, silentlyDropped } from "./delivery-ladder";

export interface DeliveryLadderProps {
  ladder: LadderBreakdown | null | undefined;
  counts: ResultCounts | null | undefined;
  findings: readonly Finding[];
  className?: string;
}

export function DeliveryLadder({ ladder, counts, findings, className }: DeliveryLadderProps) {
  const rungs = deliveryLadder(ladder, findings);
  const dropped = silentlyDropped(counts, ladder);
  return (
    <dl className={cn("grid gap-1.5 type-data text-[13px]", className)}>
      {rungs.map((rung) => {
        const live = rung.count > 0;
        return (
          <div key={rung.mode} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <dt className={cn("w-[8.5em] shrink-0", live ? "text-text-primary" : "text-text-dim")}>{rung.mode}</dt>
            <dd className={cn("tabular", live ? "text-text-primary" : "text-text-dim")}>
              {live ? `${rung.count} finding${rung.count === 1 ? "" : "s"}` : "—"}
            </dd>
            {rung.note ? <dd className="type-micro text-text-dim">{rung.note}</dd> : null}
          </div>
        );
      })}
      <div className="mt-1 border-t border-rule-hair pt-1.5 text-text-dim">
        <span className="tabular text-text-body">{dropped}</span> silently dropped
      </div>
    </dl>
  );
}
