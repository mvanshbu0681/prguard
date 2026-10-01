import type { Severity, SeverityCounts } from "@contracts";
import clsx from "clsx";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { SEVERITIES, SEVERITY_LABEL, SeverityDot } from "@/components/ui/severity";

const BAR: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  nit: "bg-sev-nit",
};

export function SeverityBreakdown({ counts }: { counts: SeverityCounts }) {
  const total = SEVERITIES.reduce((n, s) => n + counts[s], 0);
  const max = Math.max(1, ...SEVERITIES.map((s) => counts[s]));

  return (
    <Panel>
      <PanelHeader title="By severity" meta={<span className="tabular">{total}</span>} />
      <ul className="px-4 py-2">
        {SEVERITIES.map((severity) => (
          <li key={severity} className="grid h-8 grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-4 text-sm">
            <span className="flex items-center gap-2 text-body">
              <SeverityDot severity={severity} />
              {SEVERITY_LABEL[severity]}
            </span>
            <span className="block h-2 overflow-hidden rounded-full bg-surface-3">
              <span
                className={clsx("block h-full rounded-full", BAR[severity])}
                style={{ width: `${(counts[severity] / max) * 100}%` }}
              />
            </span>
            <span className={clsx("text-right tabular", counts[severity] > 0 ? "text-body" : "text-faint")}>
              {counts[severity]}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
