'use client';
// OWNER: t9a (wave 2). The 48px sticky header (dashboard §1.3, brief bullet 3):
// breadcrumbs derived from the route, the FIXTURES / LIVE badge, the ⌘K
// trigger, the projector-contrast toggle and the compact-rows toggle. One of
// exactly two backdrop-filter surfaces in the product (the palette is the
// other) — --ink-1 at 92% behind blur(16px), a 1px --rule-1 bottom edge.
//
// Breadcrumbs here are plain links derived from the pathname (routes.ts),
// simpler than the blueprint's per-segment combobox (design §1.3's "every
// breadcrumb segment is a combobox, keyboard-reachable and typeable"): that
// pattern exists to let a reviewer retarget the repo/PR/run scope inline, and
// this track owns no data source for "every repo, every PR" to populate it
// from. Flagged under `raised`.
import { ContrastIcon, Rows3Icon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { API_BASE, FIXTURES } from '@/lib/env';
import { cn } from '@/lib/utils';
import { useCompactRowsToggle, useContrastToggle } from './prefs';
import { breadcrumbsForPath } from './routes';
import { useIsMobile } from './useIsMobile';

export interface TopBarProps {
  onOpenPalette: () => void;
}

function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = breadcrumbsForPath(pathname);
  if (crumbs.length === 0) return <span className="type-data text-text-dim">/</span>;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 type-data text-text-dim">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true">▸</span> : null}
              {last ? (
                <span className="truncate text-text-primary" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate link-draw text-text-dim hover:text-text-body">
                  {crumb.label}
                </Link>
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
    return <span className="type-label text-marker">FIXTURES</span>;
  }
  return <span className="type-label text-signal-text">{`LIVE · ${API_BASE}`}</span>;
}

export function TopBar({ onOpenPalette }: TopBarProps) {
  const [contrastOn, setContrast] = useContrastToggle();
  const [compactOn, setCompact] = useCompactRowsToggle();
  const isMobile = useIsMobile();

  return (
    <header
      data-app-topbar=""
      className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-rule-1 bg-ink-1/92 px-4 backdrop-blur-[16px]"
    >
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <ModeChip />

        <button
          type="button"
          onClick={() => setContrast()}
          aria-pressed={contrastOn}
          title="Projector contrast"
          className={cn(
            'hover-quiet flex h-7 w-7 items-center justify-center rounded-data',
            contrastOn ? 'text-signal' : 'text-text-dim',
          )}
        >
          <Icon icon={ContrastIcon} size={14} label="Toggle projector contrast" />
        </button>

        <button
          type="button"
          onClick={() => setCompact()}
          aria-pressed={compactOn}
          title="Compact rows"
          className={cn(
            'hover-quiet flex h-7 w-7 items-center justify-center rounded-data',
            compactOn ? 'text-signal' : 'text-text-dim',
          )}
        >
          <Icon icon={Rows3Icon} size={14} label="Toggle compact rows" />
        </button>

        {isMobile ? null : (
          <button
            type="button"
            onClick={onOpenPalette}
            className="hover-quiet flex h-7 items-center gap-1.5 rounded-data px-2 text-text-dim"
          >
            <Icon icon={SearchIcon} size={14} />
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </button>
        )}
      </div>
    </header>
  );
}
