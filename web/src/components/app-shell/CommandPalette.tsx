'use client';
// OWNER: t9a (wave 2). The ⌘K palette (dashboard §1.4, design §5.13): navigate,
// recent runs, jump to a finding, and the three shell actions this track owns
// (toggle contrast, toggle compact rows, open the shortcut sheet). The wider
// blueprint's "Suppress finding…" / "Export evidence…" / "Verify chain" items
// belong to findings and audit (wave 3) and are out of this track's ownership —
// their command-palette entries land when those tracks compose this shell.
//
// shouldFilter is off: this component controls filtering itself, because two
// of its groups (recent runs, findings) come from a query, not from a static
// label cmdk's own fuzzy match can reason about.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { Icon } from '@/components/icons';
import { useFindings, useReviewList } from '@/lib/hooks';
import { ContrastIcon, GaugeIcon, KeyboardIcon, RowsIcon } from 'lucide-react';
import { APP_NAV_ITEMS } from './routes';
import { useCompactRowsToggle, useContrastToggle } from './prefs';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShortcuts: () => void;
}

/** A full finding/review id (uuid-shaped) vs a fingerprint prefix: both are plain hex, only the length differs. */
function looksLikeFullId(value: string): boolean {
  return /^[0-9a-f-]{16,}$/i.test(value);
}

function matches(label: string, search: string): boolean {
  return search.length === 0 || label.toLowerCase().includes(search.toLowerCase());
}

export function CommandPalette({ open, onOpenChange, onOpenShortcuts }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [contrastOn, setContrast] = useContrastToggle();
  const [compactOn, setCompact] = useCompactRowsToggle();

  function handleOpenChange(next: boolean) {
    if (!next) setSearch('');
    onOpenChange(next);
  }

  const findingQuery = search.length >= 4 ? search : '';
  const { data: findingResults } = useFindings(
    { fingerprint: findingQuery, limit: 5 },
    { enabled: findingQuery.length > 0 },
  );
  const { data: recentRuns } = useReviewList({ limit: 5 }, { enabled: open });

  const navMatches = useMemo(() => APP_NAV_ITEMS.filter((item) => matches(item.label, search)), [search]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const actions = [
    {
      key: 'contrast',
      label: contrastOn ? 'Turn off projector contrast' : 'Turn on projector contrast',
      icon: ContrastIcon,
      run: () => setContrast(),
    },
    {
      key: 'density',
      label: compactOn ? 'Switch to 32px rows' : 'Switch to 26px rows',
      icon: RowsIcon,
      run: () => setCompact(),
    },
    {
      key: 'shortcuts',
      label: 'Open the shortcut sheet',
      icon: KeyboardIcon,
      run: () => {
        onOpenChange(false);
        onOpenShortcuts();
      },
    },
  ].filter((action) => matches(action.label, search));

  const showRuns = looksLikeFullId(search) === false || search.length === 0;
  const filteredRuns = (recentRuns?.items ?? []).filter(
    (run) => matches(`${run.repository.owner}/${run.repository.name}`, search) || matches(`#${run.pull_request.number}`, search) || run.review_id.startsWith(search),
  );

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Command palette" description="Type a page, a finding id or an action.">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Type a page, a finding id or an action" value={search} onValueChange={setSearch} />
        <CommandList>
          <CommandEmpty>Nothing matches that. Try a route name, a finding id, or a fingerprint prefix.</CommandEmpty>

          {navMatches.length > 0 ? (
            <CommandGroup heading="Navigate">
              {navMatches.map((item) => (
                <CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)}>
                  {item.label}
                  <CommandShortcut>{`g ${item.chord}`}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {showRuns && filteredRuns.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent runs">
                {filteredRuns.map((run) => (
                  <CommandItem key={run.review_id} value={`run-${run.review_id}`} onSelect={() => go(`/runs/${run.review_id}`)}>
                    <GaugeIcon strokeWidth={1.5} aria-hidden="true" />
                    <span className="truncate">
                      {run.repository.owner}/{run.repository.name} #{run.pull_request.number}
                    </span>
                    <CommandShortcut>{run.status}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {findingQuery && findingResults && (findingResults.items ?? []).length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Findings">
                {(findingResults.items ?? []).map((finding) => (
                  <CommandItem key={finding.id} value={`finding-${finding.id}`} onSelect={() => go(`/findings/${finding.id}`)}>
                    <span className="truncate">{finding.title}</span>
                    <CommandShortcut>{finding.fingerprint ? finding.fingerprint.slice(0, 8) : finding.id.slice(0, 8)}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
          <CommandGroup heading="Actions">
            {actions.map((action) => (
              <CommandItem key={action.key} value={`action-${action.key}`} onSelect={action.run}>
                <Icon icon={action.icon} />
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
