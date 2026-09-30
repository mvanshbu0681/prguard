"use client";

import type { InstallationPatch, InstallationSummary, Me } from "@contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { hasRepos, useMe } from "@/components/me-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { keys } from "@/lib/queries";
import { signOut } from "@/lib/session";

export default function SettingsPage() {
  const me = useMe();

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" />

      <div className="space-y-4">
        {me.installations.length === 0 ? (
          <Panel>
            <EmptyState
              title="No organizations connected."
              action={
                !hasRepos(me) && (
                  <ButtonLink href={me.installUrl} variant="secondary" size="sm">
                    Connect repositories
                  </ButtonLink>
                )
              }
            />
          </Panel>
        ) : (
          me.installations.map((installation) => <InstallationPanel key={installation.id} installation={installation} />)
        )}

        <AccountPanel />
      </div>
    </div>
  );
}

function InstallationPanel({ installation }: { installation: InstallationSummary }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(installation.rules);
  const [saved, setSaved] = useState(false);
  const dirty = draft !== installation.rules;

  const save = useMutation({
    mutationFn: (patch: InstallationPatch) =>
      api<{ ok: true }>(`/installations/${installation.id}`, { method: "PATCH", body: patch }),
    onSuccess: (_res, patch) => {
      queryClient.setQueryData<Me>(keys.me, (me) =>
        me
          ? {
              ...me,
              installations: me.installations.map((i) => (i.id === installation.id ? { ...i, rules: patch.rules } : i)),
            }
          : me,
      );
      setSaved(true);
    },
  });

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  function submit() {
    setSaved(false);
    save.mutate({ rules: draft });
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2.5">
            <Avatar src={installation.avatarUrl} name={installation.accountLogin} size={20} square />
            {installation.accountLogin}
          </span>
        }
        meta={<span className="tabular">{plural(installation.repoCount, "repository", "repositories")}</span>}
        actions={
          <ButtonLink href={installation.settingsUrl} variant="ghost" size="sm">
            Manage on GitHub
            <ArrowUpRight aria-hidden="true" />
          </ButtonLink>
        }
      />
      <PanelBody>
        <label htmlFor={`org-rules-${installation.id}`} className="mb-2 block text-xs font-medium text-dim">
          Org rules
        </label>
        <Textarea
          id={`org-rules-${installation.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) submit();
          }}
          placeholder="One rule per line. e.g. Use the logger, never console.log."
          className="min-h-36 leading-6"
        />
      </PanelBody>
      <PanelFooter>
        <span className="mr-auto">
          {save.isError ? (
            <InlineError message="Couldn't save rules." />
          ) : (
            saved && (
              <span className="inline-flex animate-fade-in items-center gap-1.5 text-xs text-dim" role="status">
                <Check className="size-3 text-ok" aria-hidden="true" />
                Saved
              </span>
            )
          )}
        </span>
        <Button variant="primary" size="sm" onClick={submit} disabled={!installation.canEdit || !dirty || save.isPending}>
          Save
        </Button>
      </PanelFooter>
    </Panel>
  );
}

function AccountPanel() {
  const { user } = useMe();
  const [pending, setPending] = useState(false);

  return (
    <Panel>
      <PanelHeader title="Account" />
      <PanelBody className="flex items-center gap-3">
        <Avatar src={user.avatarUrl} name={user.login} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-primary">{user.name ?? user.login}</div>
          {user.name && <div className="truncate text-xs text-dim">{user.login}</div>}
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </PanelBody>
    </Panel>
  );
}
