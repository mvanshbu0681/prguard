'use client';
// OWNER: t9a (wave 2). The left rail (dashboard §1.3, brief bullet 2): Lockup A
// at the top, the three groups — Reviews, Governance (the word is deliberate:
// it sells M4 every time anyone glances at the rail), Settings — the active
// item marked with a 2px --signal-lo rail, collapsible to a 52px icon rail via
// ⌘B (useGlobalShortcuts binds the key; the button here is the pointer path to
// the same toggle, both reading src/components/app-shell/prefs.ts so they can
// never disagree). Every link is a plain <Link>: keyboard-reachable and in the
// tab order with no extra wiring.
import type { LucideIcon } from 'lucide-react';
import { ArchiveIcon, FileTextIcon, GaugeIcon, LinkIcon, ListIcon, PanelLeftCloseIcon, PanelLeftIcon, ScaleIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lockup } from '@/components/brand';
import { Icon } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSidebarCollapsed } from './prefs';
import { NAV_GROUPS, navItemsByGroup, type AppNavItem } from './routes';

const ITEM_ICON: Record<string, LucideIcon> = {
  '/overview': GaugeIcon,
  '/findings': ListIcon,
  '/suppressions': ArchiveIcon,
  '/audit': LinkIcon,
  '/accuracy': ScaleIcon,
  '/settings/policy': FileTextIcon,
};

function NavLink({ item, collapsed, active }: { item: AppNavItem; collapsed: boolean; active: boolean }) {
  const Glyph = ITEM_ICON[item.href];
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      data-active={active ? '' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-data px-2.5 text-text-dim outline-none transition-[color,background-color] duration-(--dur-1) ease-snap',
        'hover:bg-ink-3 hover:text-text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-hi',
        "relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:content-['']",
        active && 'bg-ink-4 text-text-primary before:bg-signal-lo',
      )}
    >
      {Glyph ? <Icon icon={Glyph} size={16} /> : null}
      <span className={cn('type-body truncate', collapsed && 'sr-only')}>{item.label}</span>
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  return (
    <aside
      data-app-sidebar=""
      data-collapsed={collapsed ? '' : undefined}
      className={cn(
        // width is not on the compositor allowlist (motion §6.1: transform, opacity, clip-path,
        // filter only) — the rail snaps instead of tweening, same as every other 0ms state flip.
        'flex h-dvh shrink-0 flex-col border-r border-rule-1 bg-ink-1',
        collapsed ? 'w-[52px]' : 'w-[224px]',
      )}
    >
      <div className={cn('flex h-12 items-center border-b border-rule-1', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Link href="/overview" aria-label="Witness overview" className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-hi">
          <Lockup variant={collapsed ? 'D' : 'A'} size="nav" />
        </Link>
      </div>

      <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-5 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group} className={cn('flex flex-col gap-1', collapsed ? 'px-1' : 'px-2')}>
            <p className={cn('type-label px-2.5 text-text-dim', collapsed && 'sr-only')}>{group}</p>
            {navItemsByGroup(group).map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} active={pathname === item.href} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-rule-1 py-2', collapsed ? 'flex justify-center' : 'px-2')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCollapsed()}
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
              className="hover-quiet flex h-8 w-8 items-center justify-center rounded-data text-text-dim outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-hi"
            >
              <Icon icon={collapsed ? PanelLeftIcon : PanelLeftCloseIcon} size={16} label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">⌘B</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
