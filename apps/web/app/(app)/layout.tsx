// OWNER: t9a (wave 2). The dashboard's route-group layout (plan §13 A3;
// dashboard-blueprint §0, §1.3): data-surface="app" switches the token
// overrides in app/tokens/core.css (0.018 graticule, no grain, nothing above
// 180ms, 13px body); <MotionProvider> (dashboard-only Motion via LazyMotion,
// design §0 rule 4 — nothing here exceeds 180ms) disarms the fallback
// handshake for every route under this group. AppShell (src/components/app-shell)
// owns the rail, the top bar and every overlay; this file only wires the two
// together and applies the persisted contrast/density preferences before
// first paint, so a reload never flashes the un-toggled state.
import type { ReactNode } from 'react';
import { MotionProvider } from '@/motion/motion';
import { AppShell } from '@/components/app-shell';
import { CONTRAST_ATTR, CONTRAST_STORAGE_KEY, DENSITY_ATTR, DENSITY_STORAGE_KEY } from '@/components/app-shell/prefs';

/**
 * Applies the two persisted shell preferences to <html> before React hydrates.
 * <html suppressHydrationWarning> (app/layout.tsx, T0) covers exactly this: an
 * attribute this script sets can differ from what the server rendered without
 * a hydration warning. No import, no React — this string is sent as literal
 * inline JS.
 */
const SHELL_PREFS_INIT_JS = `try{if(localStorage.getItem(${JSON.stringify(CONTRAST_STORAGE_KEY)})==='1')document.documentElement.setAttribute(${JSON.stringify(CONTRAST_ATTR)},'high');if(localStorage.getItem(${JSON.stringify(DENSITY_STORAGE_KEY)})==='1')document.documentElement.setAttribute(${JSON.stringify(DENSITY_ATTR)},'compact');}catch(e){}`;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="app" className="min-h-dvh">
      <script dangerouslySetInnerHTML={{ __html: SHELL_PREFS_INIT_JS }} />
      <MotionProvider>
        <AppShell>{children}</AppShell>
      </MotionProvider>
    </div>
  );
}
