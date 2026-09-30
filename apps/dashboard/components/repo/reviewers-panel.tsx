"use client";

import type { RepoDetail } from "@contracts";
import { InlineError } from "@/components/ui/error-state";
import { Panel, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { usePatchRepo } from "@/lib/repo-mutations";

export function ReviewersPanel({ repo }: { repo: RepoDetail }) {
  const patch = usePatchRepo(repo.id);
  const disabled = new Set(repo.disabledReviewers);
  const onCount = repo.reviewers.filter((r) => !disabled.has(r.id)).length;

  function toggle(id: string, on: boolean) {
    const next = on ? repo.disabledReviewers.filter((r) => r !== id) : [...new Set([...repo.disabledReviewers, id])];
    patch.mutate({ disabledReviewers: next });
  }

  return (
    <Panel>
      <PanelHeader
        title="Reviewers"
        meta={
          repo.reviewers.length > 0 && (
            <span className="tabular">
              {onCount} of {repo.reviewers.length} on
            </span>
          )
        }
      />
      {repo.reviewers.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-dim">No reviewers.</p>
      ) : (
        <ul>
          {repo.reviewers.map((reviewer) => {
            const on = !disabled.has(reviewer.id);
            return (
              <li key={reviewer.id} className="flex items-center gap-4 border-b border-hair px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className={on ? "text-sm font-medium text-primary" : "text-sm font-medium text-dim"}>
                    {reviewer.name}
                  </div>
                  <div className="mt-0.5 text-xs leading-[18px] text-dim">{reviewer.description}</div>
                </div>
                <Switch checked={on} onChange={(v) => toggle(reviewer.id, v)} label={reviewer.name} />
              </li>
            );
          })}
        </ul>
      )}
      {patch.isError && (
        <PanelFooter className="justify-start">
          <InlineError message="Couldn't update reviewers." />
        </PanelFooter>
      )}
    </Panel>
  );
}
