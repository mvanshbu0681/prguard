"use client";
// OWNER: d1 (wave 3). RESULT's "Delivery" sub-tab (dashboard §2.5): the two ladders, rendered
// literally — the rung that fired solid, the ones above ghosted — plus the `0 silently
// dropped` accounting badge, computed rather than asserted (§2.5: "If it ever disagrees the
// badge turns --alarm and reads `N unaccounted` — a product that claims nothing is silently
// dropped must be able to fail that claim visibly").
import { Check, SquareDot, Warn } from "@/components/icons";
import { DeliveryModeChip } from "@/components/badges";
import { IndexStrip, ProvenanceLine, Surface } from "@/components/chrome";
import { DELIVERY_MODES, GATE_DELIVERIES, type DeliveryMode, type GateDelivery } from "@/lib/contracts";
import type { DeliveryInfo, GateInfo } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { ladderTotal, ladderUnaccounted, NO_VALUE } from "./format";

const COMMENT_RUNGS = DELIVERY_MODES.filter((m): m is Exclude<DeliveryMode, "not_delivered"> => m !== "not_delivered");

export interface DeliveryPanelProps {
  delivery: DeliveryInfo | null | undefined;
  gate: GateInfo | null | undefined;
  published: number | null | undefined;
  provenance: string;
  className?: string;
}

export function DeliveryPanel({ delivery, gate, published, provenance, className }: DeliveryPanelProps) {
  const ladder = delivery?.ladder_breakdown;
  const total = ladderTotal(ladder);
  const unaccounted = ladderUnaccounted(published, ladder);
  const accounted = unaccounted === 0;

  return (
    <Surface elevation={2} variant="panel" className={className}>
      <IndexStrip index="05" category="DELIVERY" identifier={delivery?.status ?? NO_VALUE} />
      <div className="flex flex-col gap-6 px-4 py-4 md:flex-row">
        <section className="min-w-0 flex-1">
          <p className="type-label text-text-dim">COMMENT LADDER</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {COMMENT_RUNGS.map((mode) => {
              const n = ladder?.[mode] ?? 0;
              return (
                <li key={mode} className={cn("flex items-center justify-between gap-3", n === 0 && "opacity-45")}>
                  <DeliveryModeChip mode={mode} />
                  <span className="type-data tabular text-[13px] text-text-primary">{n}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 border-t border-rule-hair pt-2">
            <p className={cn("flex items-center gap-1.5 type-data text-[11px]", accounted ? "text-text-dim" : "text-alarm-text")}>
              {accounted ? <Check className="size-3 shrink-0" /> : <Warn className="size-3 shrink-0" />}
              {published ?? 0} published · {total} delivered ·{" "}
              {accounted ? "0 silently dropped" : `${Math.abs(unaccounted)} unaccounted`}
            </p>
          </div>
        </section>
        <section className="min-w-0 flex-1">
          <p className="type-label text-text-dim">GATE LADDER</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {GATE_DELIVERIES.map((rung) => {
              const fired = gate?.delivery === rung;
              return (
                <li key={rung} className={cn("flex items-center justify-between gap-3 type-data text-[13px]", !fired && "opacity-45")}>
                  <span className="flex items-center gap-1.5">
                    {fired ? (
                      <SquareDot className="text-text-dim" />
                    ) : (
                      <span aria-hidden="true" className="text-text-dim">
                        □
                      </span>
                    )}
                    {rungLabel(rung)}
                  </span>
                  {!fired ? <span className="type-data text-[11px] text-text-dim">— not attempted</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <div className="px-4 pb-3">
        <ProvenanceLine source={provenance} />
      </div>
    </Surface>
  );
}

function rungLabel(rung: GateDelivery): string {
  return rung.replaceAll("_", " ");
}
