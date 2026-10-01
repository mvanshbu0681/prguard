import type { Insights } from "@contracts";
import clsx from "clsx";
import { Panel, PanelHeader } from "@/components/ui/panel";

const PARTS = [
  { key: "confirmed", label: "Confirmed", tint: "bg-accent" },
  { key: "rejected", label: "Rejected", tint: "bg-err" },
  { key: "unverified", label: "Unverified", tint: "bg-faint" },
] as const satisfies readonly { key: keyof Insights["verification"]; label: string; tint: string }[];

export function VerificationPanel({ verification }: { verification: Insights["verification"] }) {
  const total = PARTS.reduce((n, p) => n + verification[p.key], 0);

  return (
    <Panel>
      <PanelHeader title="Verification" meta={<span className="tabular">{total}</span>} />
      <div className="px-4 py-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
          {total > 0 &&
            PARTS.map((p) =>
              verification[p.key] > 0 ? (
                <span key={p.key} className={clsx("h-full", p.tint)} style={{ width: `${(verification[p.key] / total) * 100}%` }} />
              ) : null,
            )}
        </div>
        <ul className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {PARTS.map((p) => (
            <li key={p.key} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={clsx("size-2 shrink-0 rounded-[2px]", p.tint)} />
              <span className="text-dim">{p.label}</span>
              <span className="text-body tabular">{verification[p.key]}</span>
              {total > 0 && (
                <span className="text-faint tabular">{Math.round((verification[p.key] / total) * 100)}%</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
