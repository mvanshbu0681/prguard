'use client';
// The top bar: the one glass surface in the frame — content scrolls under a
// blurred, 76%-opaque panel, and a hairline appears once it has. Breadcrumbs
// (workspace › section › item), the ⌘K search pill, the data-mode chip, the
// theme flip and the viewer. Below 768px a menu button opens the rail as a
// drawer (AppShell owns it).
import { Bell, ChevronRight, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Dot, IconButton, Kbd } from '@/components/dash/kit';
import { API_BASE, FIXTURES } from '@/lib/env';
import { breadcrumbsForPath } from './routes';
import s from './shell.module.css';

export interface TopBarProps {
  onOpenPalette: () => void;
  onOpenMenu?: () => void;
  menuOpen?: boolean;
  scrolled?: boolean;
  org?: string;
}

function Breadcrumbs({ org }: { org: string }) {
  const pathname = usePathname();
  const crumbs = breadcrumbsForPath(pathname);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className={s.crumbs}>
        <li className={s.crumbLead}>
          <Link href="/overview">{org}</Link>
        </li>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className={last ? undefined : s.crumbLead}>
              <ChevronRight size={14} strokeWidth={1.8} className={s.crumbSep} aria-hidden />
              {last ? (
                <span className={s.crumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ModeChip() {
  if (FIXTURES) {
    return (
      <span className={s.mode} title="The dashboard is reading the bundled demo corpus">
        <Dot color="var(--w-warn)" />
        Demo data
      </span>
    );
  }
  return (
    <span className={s.mode} title={API_BASE}>
      <Dot pulse />
      Live
    </span>
  );
}

export function TopBar({ onOpenPalette, onOpenMenu, menuOpen, scrolled, org = 'acme' }: TopBarProps) {
  return (
    <header data-app-topbar="" data-scrolled={scrolled ? '' : undefined} className={s.topbar}>
      <IconButton icon={Menu} label="Open navigation" className={s.mobileOnly} onClick={onOpenMenu} aria-expanded={menuOpen ?? false} aria-haspopup="dialog" />
      <div className="min-w-0 flex-1">
        <Breadcrumbs org={org} />
      </div>

      <button type="button" onClick={onOpenPalette} className={s.search} aria-label="Search and jump (⌘K)">
        <Search size={16} strokeWidth={1.9} aria-hidden />
        <span className={s.searchText}>Search findings, runs, repos…</span>
        <span className={`${s.searchKbd} flex gap-1`} aria-hidden>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <ModeChip />
      <IconButton icon={Bell} label="Notifications" badge className={s.hideXs} />
      <Avatar name="Witness Admin" size={34} title="Signed in as workspace admin" />
    </header>
  );
}
