"use client";

import { QueueBoard, QueueBoardSkeleton } from "@/components/queue/queue-board";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { useQueue } from "@/lib/queries";

export default function QueuePage() {
  const queue = useQueue();

  return (
    <>
      <PageHeader title="Queue" />

      {queue.isPending ? (
        <QueueBoardSkeleton />
      ) : queue.isError && !queue.data ? (
        <Panel>
          <ErrorState message="Couldn't load the queue." onRetry={() => void queue.refetch()} />
        </Panel>
      ) : queue.data.length === 0 ? (
        <Panel>
          <EmptyState title="No open pull requests." />
        </Panel>
      ) : (
        <QueueBoard items={queue.data} />
      )}
    </>
  );
}
