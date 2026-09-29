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
import { ContrastIcon, FolderGit2Icon, GitPullRequestArrow, KeyboardIcon, MoonIcon, PlusIcon, RowsIcon, ScanSearchIcon, SunIcon } from 'lucide-react';
import { useDashTheme, setDashTheme } from '@/components/dash/theme';
import { NAV_ICON } from './nav-icons';
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
  const theme = useDashTheme();

  function handleOpenChange(next: boolean) {
    if (!next) setSearch('');
    onOpenChange(next);
  }

  const q = search.trim().toLowerCase();
  // One read of the corpus while the palette is open; everything below filters it client-side,
  // so a title word, an id prefix, a fingerprint prefix or a repo name all find something.
  const { data: findingPool } = useFindings({ limit: 200 }, { enabled: open });
  const { data: runPool } = useReviewList({ limit: 100 }, { enabled: open });
  const recentRuns = useMemo(() => ({ items: (runPool?.items ?? []).slice(0, q ? 100 : 5) }), [runPool, q]);

  const findingMatches = useMemo(() => {
    if (q.length < 2) return [];
    return (findingPool?.items ?? [])
      .filter((f) => f.id.startsWith(q) || (f.fingerprint ?? '').startsWith(q) || (f.title ?? '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [findingPool, q]);

  const repoMatches = useMemo(() => {
    if (q.length < 2) return [];
    const seen = new Map<string, { owner: string; name: string }>();
    for (const r of runPool?.items ?? []) seen.set(`${r.repository.owner}/${r.repository.name}`, r.repository);
    return [...seen.entries()].filter(([slug]) => slug.toLowerCase().includes(q)).slice(0, 5);
  }, [runPool, q]);

  const navMatches = useMemo(() => APP_NAV_ITEMS.filter((item) => matches(item.label, search)), [search]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const actions = [
    {
      key: 'new-review',
      label: 'Start a new review',
      icon: PlusIcon,
      run: () => go('/repos?new=1'),
    },
    {
      key: 'theme',
      label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: theme === 'dark' ? SunIcon : MoonIcon,
      run: () => setDashTheme(theme === 'dark' ? 'light' : 'dark'),
    },
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

  const filteredRuns = (recentRuns.items ?? [])
    .filter(
      (run) =>
        q.length === 0 ||
        `${run.repository.owner}/${run.repository.name}`.toLowerCase().includes(q) ||
        `#${run.pull_request.number}`.includes(q) ||
        (run.pull_request.title ?? '').toLowerCase().includes(q) ||
        run.review_id.startsWith(q),
    )
    .slice(0, 5);
  const fullId = looksLikeFullId(q) && q.length >= 32 ? q : null;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Command palette" description="Type a page, a finding id or an action.">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search pages, runs, findings or actions…" value={search} onValueChange={setSearch} />
        <CommandList>
          <CommandEmpty>Nothing matches that. Try a page, a repository, a finding title, an id or a fingerprint prefix.</CommandEmpty>

          {navMatches.length > 0 ? (
            <CommandGroup heading="Navigate">
              {navMatches.map((item) => (
                <CommandItem key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)}>
                  {NAV_ICON[item.href] ? <Icon icon={NAV_ICON[item.href]} /> : null}
                  {item.label}
                  <CommandShortcut>{`g ${item.chord}`}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {repoMatches.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Repositories">
                {repoMatches.map(([slug, repo]) => (
                  <CommandItem key={slug} value={`repo-${slug}`} onSelect={() => go(`/repos/${repo.owner}/${repo.name}`)}>
                    <Icon icon={FolderGit2Icon} />
                    <span className="truncate">{slug}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {findingMatches.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Findings">
                {findingMatches.map((finding) => (
                  <CommandItem key={finding.id} value={`finding-${finding.id}`} onSelect={() => go(`/findings/${finding.id}`)}>
                    <Icon icon={ScanSearchIcon} />
                    <span className="truncate">{finding.title}</span>
                    <CommandShortcut>{(finding.fingerprint ?? finding.id).slice(0, 8)}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {filteredRuns.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={q ? 'Reviews' : 'Recent reviews'}>
                {filteredRuns.map((run) => (
                  <CommandItem key={run.review_id} value={`run-${run.review_id}`} onSelect={() => go(`/runs/${run.review_id}`)}>
                    <Icon icon={GitPullRequestArrow} />
                    <span className="truncate">
                      {run.repository.name} #{run.pull_request.number} · {run.pull_request.title}
                    </span>
                    <CommandShortcut>{run.gate_conclusion === 'failure' ? 'blocked' : run.status}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {fullId && findingMatches.length === 0 && filteredRuns.length === 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Open by id">
                <CommandItem value={`open-finding-${fullId}`} onSelect={() => go(`/findings/${fullId}`)}>
                  <Icon icon={ScanSearchIcon} />
                  Open finding {fullId.slice(0, 8)}
                </CommandItem>
                <CommandItem value={`open-run-${fullId}`} onSelect={() => go(`/runs/${fullId}`)}>
                  <Icon icon={GitPullRequestArrow} />
                  Open review {fullId.slice(0, 8)}
                </CommandItem>
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
