// OWNER: t9a (wave 2). The dashboard's shell: everything around the eight D2
// routes wave 3 composes into pages (plan A3; dashboard-blueprint §0, §1.3–§1.5,
// §2.0; brand-gaps §F–§G).
//
// Quick reference for wave-3 consumers:
//   Rendered once, by app/(app)/layout.tsx: <AppShell> (rail, top bar, offline
//   and mobile bands, ⌘K palette, shortcut sheet, every global key binding).
//   A route page renders straight into <main id="main">; it needs none of the
//   shell's own components to do that.
//
//   States, defined once (dashboard §2.0), for any route's data states:
//     <LoadingState rows={8} density="full" />            skeleton rows, no shimmer
//     <EmptyState message={…} actions={[…]} />             never "No data available"
//     <ErrorState error={apiError} onRetry={refetch} />    inline, never a toast
//
//   A route under an unbuilt path (plan A3) renders:
//     <BetaNotFound route="/runs" />                        the exact line "not built for the beta"
//
//   For a table (findings, suppressions, audit — wave 3):
//     const { gridProps, rowProps, activeIndex } = useListKeys({ count, onOpen });
//
// routes.ts is the single source of truth for the six nav items, the go-to
// chords and the breadcrumb derivation — read it before hand-rolling a route
// list or a link.
export { AppShell } from './AppShell';
export { Sidebar } from './Sidebar';
export { TopBar, type TopBarProps } from './TopBar';
export { CommandPalette, type CommandPaletteProps } from './CommandPalette';
export { ShortcutSheet, type ShortcutSheetProps } from './ShortcutSheet';
export { BetaNotFound, type BetaNotFoundProps } from './BetaNotFound';
export { EmptyState, type EmptyStateAction, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { LoadingState, type LoadingStateProps } from './LoadingState';
export { OfflineBanner } from './OfflineBanner';
export { MobileBanner, MOBILE_BANNER_TEXT } from './MobileBanner';
export { useListKeys, type UseListKeysOptions, type UseListKeysResult } from './useListKeys';
export { useGlobalShortcuts, type GlobalShortcutHandlers } from './useGlobalShortcuts';
export { useIsMobile, MOBILE_QUERY } from './useIsMobile';
export {
  useContrastToggle,
  useCompactRowsToggle,
  useSidebarCollapsed,
  hydrateShellPrefs,
  CONTRAST_ATTR,
  DENSITY_ATTR,
} from './prefs';
export {
  APP_NAV_ITEMS,
  NAV_GROUPS,
  CHORD_MAP,
  BETA_ROUTES,
  navItemsByGroup,
  isActiveNavItem,
  breadcrumbsForPath,
  shortSegment,
  type AppNavItem,
  type NavGroup,
  type Crumb,
} from './routes';
