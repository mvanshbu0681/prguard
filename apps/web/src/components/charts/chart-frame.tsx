// OWNER: t10 (wave 2).
//
// <ChartFrame> — the ordinary-panel chrome every chart in this folder shares:
// Surface + IndexStrip + ProvenanceStrip, no registration marks (Exhibit is
// for evidence frames only — plan §2 hard rule 1; charts are analysis, not the
// artifact itself). Also owns the one shared empty state: charts 2-4 read
// fixture-only series (plan A11) that a live backend does not serve yet.
import type { ReactNode } from "react";
import { IndexStrip, ProvenanceStrip, Surface } from "@/components/chrome";
import { cn } from "@/lib/utils";

export interface ChartFrameProps {
  index: string;
  category: string;
  provenance: ReactNode;
  ext?: boolean;
  meta?: ReactNode;
  /** True when there is no data to plot (live mode, before a backend serves this shape). */
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  children: ReactNode;
}

const DEFAULT_EMPTY_LABEL = "not served by GET /v1/accuracy yet";

export function ChartFrame({ index, category, provenance, ext = false, meta, empty = false, emptyLabel = DEFAULT_EMPTY_LABEL, className, children }: ChartFrameProps) {
  return (
    <Surface elevation={2} variant="card" className={cn("prg-chart-frame flex flex-col gap-4", className)}>
      <IndexStrip index={index} category={category} meta={meta} />
      {empty ? <p className="type-small text-text-dim">{emptyLabel}</p> : children}
      <ProvenanceStrip source={provenance} ext={ext} />
    </Surface>
  );
}
