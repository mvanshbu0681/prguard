'use client';
// OWNER: t9a (wave 2). Composes every piece this track owns around a route's
// content: the rail, the top bar, the offline and mobile bands, the palette,
// the shortcut sheet and the global key bindings. app/(app)/layout.tsx is a
// thin Server Component wrapper around this — everything stateful lives here
// so the layout itself stays trivial to read.
//
// Below 768px the rail and the palette disappear (brand-gaps §G) via a CSS
// breakpoint on the rail (no JS, no hydration flicker) and `enabled: !isMobile`
// on the key bindings (a JS check is fine here: a shortcut firing during the
// one frame before hydration settles is not observable).
import { useEffect, useState, type ReactNode } from 'react';
import { CommandPalette } from './CommandPalette';
import { MobileBanner } from './MobileBanner';
import { OfflineBanner } from './OfflineBanner';
import { hydrateShellPrefs, useSidebarCollapsed } from './prefs';
import { ShortcutSheet } from './ShortcutSheet';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useIsMobile } from './useIsMobile';

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [, toggleSidebar] = useSidebarCollapsed();
  const isMobile = useIsMobile();

  useEffect(() => {
    hydrateShellPrefs();
  }, []);

  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onToggleSidebar: () => toggleSidebar(),
    onOpenShortcuts: () => setShortcutsOpen(true),
    enabled: !isMobile,
  });

  return (
    <div className="flex h-dvh">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <OfflineBanner />
        <MobileBanner />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      {!isMobile ? (
        <>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenShortcuts={() => setShortcutsOpen(true)} />
          <ShortcutSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </>
      ) : null}
    </div>
  );
}
