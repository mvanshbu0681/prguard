"use client";

import type { Learning, LearningSource, RepoDetail } from "@contracts";
import clsx from "clsx";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError } from "@/components/ui/error-state";
import { InlineCode } from "@/components/ui/inline-code";
import { Markdown } from "@/components/ui/markdown";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/components/ui/time";
import { plural } from "@/lib/format";
import { useAddLearning, useDeleteLearning, usePatchLearning } from "@/lib/learning-mutations";
import { useLearnings } from "@/lib/queries";

const SOURCE_LABEL: Record<LearningSource, string> = {
  command: "Command",
  reaction: "Thumbs down",
  reply: "Reply",
  manual: "Manual",
};

export function LearningsPanel({ repo }: { repo: RepoDetail }) {
  const learnings = useLearnings(repo.id);
  const add = useAddLearning(repo.id);
  const patch = usePatchLearning(repo.id);
  const remove = useDeleteLearning(repo.id);
  const [draft, setDraft] = useState("");

  const list = [...(learnings.data ?? [])].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const text = draft.trim();
  const error = add.isError
    ? "Couldn't add learning."
    : patch.isError
      ? "Couldn't update learning."
      : remove.isError
        ? "Couldn't delete learning."
        : null;

  function submit() {
    if (!text || add.isPending) return;
    patch.reset();
    remove.reset();
    add.mutate({ text }, { onSuccess: () => setDraft("") });
  }

  function toggle(learning: Learning, enabled: boolean) {
    add.reset();
    remove.reset();
    patch.mutate({ id: learning.id, patch: { enabled } });
  }

  function del(learning: Learning) {
    add.reset();
    patch.reset();
    remove.mutate(learning.id);
  }

  return (
    <Panel>
      <PanelHeader
        title="Learnings"
        meta={list.length > 0 && <span className="tabular">{plural(list.length, "learning")}</span>}
      />

      {learnings.isPending ? (
        <LearningsSkeleton />
      ) : learnings.isError && !learnings.data ? (
        <ErrorState message="Couldn't load learnings." onRetry={() => void learnings.refetch()} className="py-8" />
      ) : list.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-dim">No learnings yet.</p>
      ) : (
        <ul>
          {list.map((learning) => (
            <LearningRow
              key={learning.id}
              learning={learning}
              canEdit={repo.canEdit}
              onToggle={(enabled) => toggle(learning, enabled)}
              onDelete={() => del(learning)}
            />
          ))}
        </ul>
      )}

      {repo.canEdit ? (
        <>
          <PanelBody className="border-t border-line">
            <Textarea
              aria-label="New learning"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              placeholder="New learning"
              className="min-h-20 leading-6"
            />
          </PanelBody>
          <PanelFooter>
            <span className="mr-auto">{error && <InlineError message={error} />}</span>
            <Button variant="primary" size="sm" onClick={submit} disabled={!text || add.isPending}>
              Add
            </Button>
          </PanelFooter>
        </>
      ) : (
        error && (
          <PanelFooter className="justify-start">
            <InlineError message={error} />
          </PanelFooter>
        )
      )}
    </Panel>
  );
}

function LearningRow({
  learning,
  canEdit,
  onToggle,
  onDelete,
}: {
  learning: Learning;
  canEdit: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-hair px-4 py-3 last:border-0">
      <div className={clsx("min-w-0 flex-1", !learning.enabled && "opacity-50")}>
        {learning.text.includes("\n") ? (
          <Markdown size="sm">{learning.text}</Markdown>
        ) : (
          <p className="break-words text-sm leading-[21px] text-body">
            <InlineCode text={learning.text} />
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-dim">
          <span>{SOURCE_LABEL[learning.source]}</span>
          {learning.author && (
            <>
              <Sep />
              <span className="min-w-0 truncate">{learning.author}</span>
            </>
          )}
          <Sep />
          <RelativeTime ts={learning.createdAt} className="tabular" />
          {learning.url && (
            <>
              <Sep />
              <a
                href={learning.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded-sm transition-colors hover:text-primary"
              >
                GitHub
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </a>
            </>
          )}
        </div>
      </div>
      <div className="-mr-2 flex shrink-0 items-center gap-1">
        <Switch checked={learning.enabled} onChange={onToggle} label="Enabled" disabled={!canEdit} />
        <Button variant="ghost" size="sm" aria-label="Delete learning" onClick={onDelete} disabled={!canEdit}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-faint">
      ·
    </span>
  );
}

function LearningsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      {[78, 56].map((w, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-hair px-4 py-3.5 last:border-0">
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-2.5" style={{ width: `${w}%` }} />
            <Skeleton className="h-2 w-28" />
          </div>
          <Skeleton className="h-4 w-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}
