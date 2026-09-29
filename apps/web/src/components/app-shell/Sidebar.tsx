'use client';
// The dashboard rail, on the landing system: the Witness eye in an ink tile,
// the workspace (the connected GitHub org), THE call to action — "New review",
// the lime pill — then three groups of pill links, a sky card that says what
// Witness is watching, and the theme switch. Collapses to a 76px icon rail
// (⌘B, persisted in prefs.ts). Counts come from the server layout (fixture
// mode only), so the rail never fetches anything itself.
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrackingMark } from '@/components/brand';
import { Avatar, Button, Dot, GateBadge, IconButton } from '@/components/dash/kit';
import { relTime } from '@/components/dash/format';
import { ThemeSwitch } from '@/components/dash/ThemeSwitch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useReposState } from '@/components/routes/repos/store';
import { NAV_ICON } from './nav-icons';
import { useSidebarCollapsed } from './prefs';
import { isActiveNavItem, NAV_GROUPS, navItemsByGroup, type AppNavItem } from './routes';
import s from './shell.module.css';

const ITEM_ICON = NAV_ICON;

export interface LatestReview {
  id: string;
  repo: string;
  number: number;
  title: string;
  gate: 'failure' | 'success' | 'neutral' | null;
  when: string;
}

export interface ShellCounts {
  latest?: LatestReview;
  blocked?: number;
  repositories?: number;
  runs?: number;
  findings?: number;
  suppressions?: number;
  proven?: number;
  org?: string;
}

function NavLink({ item, collapsed, active, count }: { item: AppNavItem; collapsed: boolean; active: boolean; count?: number }) {
  const Glyph = ITEM_ICON[item.href];
  const link = (
    <Link href={item.href} aria-label={count != null ? `${item.label}, ${count}` : item.label} aria-current={active ? 'page' : undefined} data-active={active ? '' : undefined} className={s.link}>
      <span className={s.linkIcon}>{Glyph ? <Glyph size={18} strokeWidth={active ? 2 : 1.8} aria-hidden /> : null}</span>
      <span className={s.linkLabel}>{item.label}</span>
      {count != null ? <span className={s.count}>{count}</span> : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ counts = {}, onNavigate, inDrawer }: { counts?: ShellCounts; onNavigate?: () => void; inDrawer?: boolean }) {
  const pathname = usePathname();
  const [storedCollapsed, setCollapsed] = useSidebarCollapsed();
  // The phone drawer is always the full rail, and never offers to collapse.
  const collapsed = inDrawer ? false : storedCollapsed;
  // The Repositories demo keeps the viewer's GitHub connection in localStorage;
  // null until read, so the server render and first paint show the connected copy.
  const repos = useReposState();
  const connected = repos === null ? null : repos.connection !== null;
  const org = repos?.connection?.account ?? counts.org ?? 'acme';
  const repoCount = counts.repositories != null ? counts.repositories + (repos?.imported.length ?? 0) : undefined;
  const countFor: Record<string, number | undefined> = {
    '/repos': repoCount,
    '/runs': counts.runs,
    '/findings': counts.findings,
    '/suppressions': counts.suppressions,
  };

  return (
    <aside data-app-sidebar="" data-collapsed={collapsed ? '' : undefined} data-drawer={inDrawer ? '' : undefined} className={s.sidebar} onClick={onNavigate ? (e) => (e.target as HTMLElement).closest('a') && onNavigate() : undefined}>
      <div className={s.brandRow}>
        <Link href="/overview" className={s.brand} aria-label="Witness overview">
          <span className={s.brandMark}>
            <TrackingMark size={22} />
          </span>
          {collapsed ? null : <span className={s.brandText}>Witness</span>}
        </Link>
        {collapsed || inDrawer ? null : (
          <IconButton icon={PanelLeftClose} label="Collapse sidebar (⌘B)" size="sm" onClick={() => setCollapsed()} className={s.collapseBtn} />
        )}
      </div>

      <Link href="/repos" className={s.workspace} aria-label={`Workspace ${org}: ${connected === false ? 'GitHub not connected' : 'GitHub connected'}`} title={collapsed ? `${org} · GitHub` : undefined}>
        <Avatar name={org} size={collapsed ? 36 : 32} square />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className={s.workspaceName}>{org}</span>
              <span className={s.workspaceMeta}>
                {connected === false ? (
                  <>
                    <Dot color="var(--w-warn)" /> Demo workspace
                  </>
                ) : (
                  <>
                    <Dot pulse /> GitHub · {repoCount ?? 0} repos
                  </>
                )}
              </span>
            </span>
            <ChevronsUpDown size={15} strokeWidth={1.8} className="text-w-subtle" aria-hidden />
          </>
        )}
      </Link>

      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton icon={Plus} label="New review" variant="dark" size="lg" href="/repos?new=1" className="mx-auto" />
          </TooltipTrigger>
          <TooltipContent side="right">New review</TooltipContent>
        </Tooltip>
      ) : (
        <Button variant="dark" chip={Plus} chipStill href="/repos?new=1" className={s.newReview}>
          New review
        </Button>
      )}

      <nav aria-label="Dashboard" className={s.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group} className={s.group}>
            <p className={s.groupLabel}>{group}</p>
            {navItemsByGroup(group).map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} active={isActiveNavItem(pathname, item.href)} count={countFor[item.href]} />
            ))}
          </div>
        ))}
      </nav>

      {counts.latest ? (
        <Link href={`/runs/${counts.latest.id}`} className={s.watch} aria-label={`Latest review: ${counts.latest.repo} #${counts.latest.number}`}>
          <span className={s.watchHead}>
            <Dot pulse />
            Latest review · {relTime(counts.latest.when)}
          </span>
          <span className={s.watchTitle}>{counts.latest.title}</span>
          <span className={s.watchMeta}>
            <span>
              {counts.latest.repo} #{counts.latest.number}
            </span>
            <GateBadge conclusion={counts.latest.gate} size="sm" />
          </span>
          {counts.blocked ? (
            <span className={s.watchFoot}>
              <b>{counts.blocked}</b> PRs held by a proven bug
            </span>
          ) : null}
        </Link>
      ) : null}

      <div className={s.foot}>
        <ThemeSwitch compact={collapsed} />
        {collapsed ? <IconButton icon={PanelLeftOpen} label="Expand sidebar (⌘B)" size="sm" onClick={() => setCollapsed()} /> : null}
      </div>
    </aside>
  );
}
