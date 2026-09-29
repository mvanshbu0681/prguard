'use client';
// The dashboard shell: the rail on the canvas, the page in a rounded frame,
// the glass top bar floating over the frame's scroll area, plus the palette,
// the shortcut sheet, the offline band and the global key bindings.
//
// Below 768px the rail becomes a drawer opened from the top bar; the palette
// still opens from the search button, but the key chords switch off.
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useDashThemeRoot } from '@/components/dash/theme';
import { useRestoreFocus } from '@/components/ui/restore-focus';
import { CONTRAST_ATTR, DENSITY_ATTR, RAIL_ATTR, SIDEBAR_STORAGE_KEY } from './pref-keys';
import { CommandPalette } from './CommandPalette';
import { OfflineBanner } from './OfflineBanner';
import { hydrateShellPrefs, useSidebarCollapsed } from './prefs';
import { ShortcutSheet } from './ShortcutSheet';
import { Sidebar, type ShellCounts } from './Sidebar';
import { TopBar } from './TopBar';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useIsMobile } from './useIsMobile';
import s from './shell.module.css';

export function AppShell({ children, counts }: { children: ReactNode; counts?: ShellCounts }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [, toggleSidebar] = useSidebarCollapsed();
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useDashThemeRoot();
  const drawerFocus = useRestoreFocus();

  useBeforePaint(() => {
    hydrateShellPrefs();
    try {
      if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1') document.documentElement.setAttribute(RAIL_ATTR, '');
    } catch {
      /* storage blocked: the rail just renders expanded */
    }
    // The contrast and density preferences are dashboard-only: leaving the
    // dashboard (a client navigation back to the landing) takes them off <html>.
    return () => {
      document.documentElement.removeAttribute(CONTRAST_ATTR);
      document.documentElement.removeAttribute(DENSITY_ATTR);
      document.documentElement.removeAttribute(RAIL_ATTR);
    };
  }, []);

  // A new route starts at the top, with the top bar's hairline off and the drawer shut.
  const [routeSeen, setRouteSeen] = useState(pathname);
  if (routeSeen !== pathname) {
    setRouteSeen(pathname);
    setScrolled(false);
    setDrawerOpen(false);
  }
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onToggleSidebar: () => toggleSidebar(),
    onOpenShortcuts: () => setShortcutsOpen(true),
    enabled: !isMobile,
  });

  return (
    <div className={s.shell}>
      <div className={s.desktopRail}>
        <Sidebar counts={counts} />
      </div>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={s.drawerScrim} />
          <DialogPrimitive.Content className={s.drawer} aria-describedby={undefined} {...drawerFocus}>
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <Sidebar counts={counts} inDrawer onNavigate={() => setDrawerOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className={s.frameWrap}>
        <div className={s.frame}>
          <TopBar onOpenPalette={() => setPaletteOpen(true)} onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} scrolled={scrolled} org={counts?.org} />
          <main
            id="main"
            ref={mainRef}
            className={s.main}
            onScroll={(e) => {
              const next = (e.currentTarget as HTMLElement).scrollTop > 4;
              if (next !== scrolled) setScrolled(next);
            }}
          >
            <div className={s.mainInner}>
              <OfflineBanner />
              {children}
            </div>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenShortcuts={() => setShortcutsOpen(true)} />
      {!isMobile ? <ShortcutSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} /> : null}
    </div>
  );
}
