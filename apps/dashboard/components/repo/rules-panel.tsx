"use client";

import type { RepoDetail } from "@contracts";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/format";
import { usePatchRepo } from "@/lib/repo-mutations";

function countRules(text: string): number {
  return text.split("\n").filter((line) => line.trim()).length;
}

export function RulesPanel({ repo }: { repo: RepoDetail }) {
  const patch = usePatchRepo(repo.id);
  const [draft, setDraft] = useState(repo.rules);
  const [saved, setSaved] = useState(false);

  const dirty = draft !== repo.rules;
  const count = countRules(repo.rules);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  function save() {
    setSaved(false);
    patch.mutate({ rules: draft }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Panel>
      <PanelHeader title="Rules" meta={count > 0 && <span className="tabular">{plural(count, "rule")}</span>} />
      <PanelBody>
        <Textarea
          aria-label="Rules"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) save();
          }}
          placeholder="One rule per line. e.g. Use the logger, never console.log."
          className="min-h-36 leading-6"
        />
      </PanelBody>
      <PanelFooter>
        <span className="mr-auto">
          {patch.isError ? (
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
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty || patch.isPending}>
          Save
        </Button>
      </PanelFooter>
    </Panel>
  );
}
