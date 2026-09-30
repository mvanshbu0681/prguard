"use client";

import type { RepoDetail } from "@contracts";
import { Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Markdown } from "@/components/ui/markdown";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { SkeletonText } from "@/components/ui/skeleton";
import { briefState, StatusLabel } from "@/components/ui/status";
import { Textarea } from "@/components/ui/textarea";
import { RelativeTime } from "@/components/ui/time";
import { isBriefBusy } from "@/lib/queries";
import { usePatchRepo, useRescanRepo } from "@/lib/repo-mutations";

export function BriefPanel({ repo }: { repo: RepoDetail }) {
  const patch = usePatchRepo(repo.id);
  const rescan = useRescanRepo(repo.id);
  const [draft, setDraft] = useState<string | null>(null);

  const editing = draft !== null;
  const busy = isBriefBusy(repo.briefStatus) || rescan.isPending;
  const state = briefState(repo.briefStatus);
  const brief = repo.brief?.trim() ? repo.brief : null;

  function save() {
    if (draft === null) return;
    patch.mutate({ brief: draft }, { onSuccess: () => setDraft(null) });
  }

  return (
    <Panel>
      <PanelHeader
        title="Brief"
        meta={
          <>
            <StatusLabel tone={state.tone} label={state.label} />
            {repo.briefUpdatedAt !== null && (
              <span className="truncate text-faint">
                Updated <RelativeTime ts={repo.briefUpdatedAt} />
              </span>
            )}
          </>
        }
        actions={
          !editing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => rescan.mutate()} disabled={busy}>
                <RefreshCw aria-hidden="true" />
                Rescan
              </Button>
              {brief && (
                <Button variant="ghost" size="sm" onClick={() => setDraft(repo.brief ?? "")} disabled={busy}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              )}
            </>
          )
        }
      />

      {editing ? (
        <>
          <PanelBody>
            <Textarea
              aria-label="Brief"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[480px] font-mono text-xs leading-5"
              autoFocus
            />
          </PanelBody>
          <PanelFooter>
            {patch.isError && (
              <span className="mr-auto">
                <InlineError message="Couldn't save the brief." />
              </span>
            )}
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={patch.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={patch.isPending || draft === (repo.brief ?? "")}>
              Save
            </Button>
          </PanelFooter>
        </>
      ) : brief ? (
        <PanelBody className="px-5 py-4">
          <Markdown size="sm">{brief}</Markdown>
        </PanelBody>
      ) : busy ? (
        <PanelBody className="px-5 py-5">
          <SkeletonText lines={6} />
        </PanelBody>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-sm text-dim">No brief yet.</p>
          <Button size="sm" onClick={() => rescan.mutate()} disabled={busy}>
            <RefreshCw aria-hidden="true" />
            Rescan
          </Button>
        </div>
      )}

      {rescan.isError && !editing && (
        <PanelFooter className="justify-start">
          <InlineError message="Couldn't start a rescan." />
        </PanelFooter>
      )}
    </Panel>
  );
}
