// OWNER: m4 (wave 3). The band legend line under section 05's subhead — plain
// server-rendered text, no client boundary needed (landing blueprint §05).
import { cn } from "@/lib/utils";
import { bandLegend } from "./band-legend";

export interface BandLegendProps {
  className?: string;
}

export function BandLegend({ className }: BandLegendProps) {
  const entries = bandLegend();
  return (
    <p className={cn("type-label text-text-dim", className)}>
      {entries.map((e, i) => (
        <span key={e.band} className="whitespace-nowrap">
          {i > 0 ? <span aria-hidden="true"> &middot; </span> : null}
          {e.band} {e.op} {e.value}
        </span>
      ))}
    </p>
  );
}
