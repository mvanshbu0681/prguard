import type { ReviewerInsight } from "@contracts";
import clsx from "clsx";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ReviewerIcon } from "@/components/ui/pills";

const grid =
  "grid grid-cols-[168px_minmax(0,1fr)_56px_56px_80px_56px_64px_88px] items-center gap-4 px-4";

const SEGMENTS = [
  { key: "fixed", label: "Fixed", tint: "bg-ok" },
  { key: "dismissed", label: "Dismissed", tint: "bg-faint" },
  { key: "open", label: "Open", tint: "bg-body/75" },
] as const satisfies readonly { key: keyof ReviewerInsight; label: string; tint: string }[];

function rate(n: number, total: number): string | null {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : null;
}

export function ReviewerBreakdown({ reviewers }: { reviewers: ReviewerInsight[] }) {
  const rows = [...reviewers].sort((a, b) => b.posted - a.posted);
  const totals = rows.map((r) => Math.max(r.posted, r.fixed + r.dismissed + r.open));
  const max = Math.max(1, ...totals);

  return (
    <Panel>
      <PanelHeader title="Findings by reviewer" />
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-dim">No findings.</p>
      ) : (
        <div role="table" aria-label="Findings by reviewer">
          <div role="row" className={clsx(grid, "h-9 border-b border-line text-xs font-medium text-dim")}>
            <span role="columnheader">Reviewer</span>
            <span role="columnheader">
              <span className="sr-only">Breakdown</span>
            </span>
            <span role="columnheader" className="text-right">
              Posted
            </span>
            {SEGMENTS.map((s) => (
              <span key={s.key} role="columnheader" className="inline-flex items-center justify-end gap-1.5">
                <span aria-hidden="true" className={clsx("size-2 shrink-0 rounded-[2px]", s.tint)} />
                {s.label}
              </span>
            ))}
            <span role="columnheader" className="text-right">
              Fix rate
            </span>
            <span role="columnheader" className="text-right">
              Dismiss rate
            </span>
          </div>

          <div role="rowgroup">
            {rows.map((r, i) => {
              const total = totals[i] ?? 0;
              const fixRate = rate(r.fixed, r.posted);
              const dismissRate = rate(r.dismissed, r.posted);
              return (
                <div key={r.id} role="row" className={clsx(grid, "h-10 border-b border-hair text-sm last:border-b-0")}>
                  <span role="cell" className="flex min-w-0 items-center gap-1.5 text-primary">
                    <ReviewerIcon badge={r.badge} />
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span role="cell" className="block h-2 overflow-hidden rounded-full bg-surface-3">
                    <span className="flex h-full overflow-hidden rounded-full" style={{ width: `${(total / max) * 100}%` }}>
                      {total > 0 &&
                        SEGMENTS.map((s) =>
                          r[s.key] > 0 ? (
                            <span key={s.key} className={clsx("h-full", s.tint)} style={{ width: `${(r[s.key] / total) * 100}%` }} />
                          ) : null,
                        )}
                    </span>
                  </span>
                  <span role="cell" className="text-right text-primary tabular">
                    {r.posted}
                  </span>
                  {SEGMENTS.map((s) => (
                    <span key={s.key} role="cell" className="text-right text-body tabular">
                      {r[s.key]}
                    </span>
                  ))}
                  <span role="cell" className={clsx("text-right tabular", fixRate ? "text-body" : "text-faint")}>
                    {fixRate ?? "n/a"}
                  </span>
                  <span role="cell" className={clsx("text-right tabular", dismissRate ? "text-body" : "text-faint")}>
                    {dismissRate ?? "n/a"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
