import type { Priority, QueueItem, RiskLevel } from "@contracts";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { PriorityPill } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import { QueueCard, QueueCardSkeleton } from "./queue-card";

const PRIORITIES: readonly Priority[] = ["p0", "p1", "p2", "p3"];

const RISK_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

// Riskiest first, then the longest waiting.
function byRiskThenAge(a: QueueItem, b: QueueItem): number {
  const risk = (a.risk ? RISK_RANK[a.risk] : 3) - (b.risk ? RISK_RANK[b.risk] : 3);
  return risk !== 0 ? risk : a.pr.createdAt - b.pr.createdAt;
}

function itemKey(item: QueueItem): string {
  return `${item.repository.id}#${item.pr.number}`;
}

export function QueueBoard({ items }: { items: QueueItem[] }) {
  const sorted = [...items].sort(byRiskThenAge);
  const waiting = sorted.filter((item) => item.priority === null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 items-start gap-4">
        {PRIORITIES.map((priority) => {
          const column = sorted.filter((item) => item.priority === priority);
          return (
            <Panel key={priority}>
              <PanelHeader title={<PriorityPill priority={priority} />} meta={<span className="tabular">{column.length}</span>} />
              {column.length > 0 && (
                <div className="space-y-2 p-2">
                  {column.map((item) => (
                    <QueueCard key={itemKey(item)} item={item} />
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {waiting.length > 0 && (
        <Panel>
          <PanelHeader title="Waiting" meta={<span className="tabular">{waiting.length}</span>} />
          <div className="grid grid-cols-4 items-start gap-2 p-2">
            {waiting.map((item) => (
              <QueueCard key={itemKey(item)} item={item} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export function QueueBoardSkeleton() {
  return (
    <div className="grid grid-cols-4 items-start gap-4" aria-busy="true" aria-label="Loading">
      {PRIORITIES.map((priority, column) => (
        <Panel key={priority}>
          <div className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2.5 w-4" />
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 - (column % 2) }, (_, i) => (
              <QueueCardSkeleton key={i} index={column * 3 + i} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
