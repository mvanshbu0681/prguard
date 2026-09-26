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
    // flex-wrap, not inline text wrapping: two whitespace-nowrap spans with no space
    // between them have no break opportunity at all and overflow the viewport as one
    // unbroken line at narrow widths.
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 type-label text-text-dim", className)}>
      {entries.map((e) => (
        <span key={e.band} className="whitespace-nowrap">
          {e.band} {e.op} {e.value}
        </span>
      ))}
    </div>
  );
}
