// Server-safe preference keys (no 'use client'), shared by prefs.ts and the
// app layout's pre-paint script.
export const CONTRAST_ATTR = 'data-contrast';
export const CONTRAST_STORAGE_KEY = 'witness:contrast';
export const DENSITY_ATTR = 'data-density';
export const DENSITY_STORAGE_KEY = 'witness:density';
export const SIDEBAR_STORAGE_KEY = 'witness:sidebar-collapsed';
/** Set on <html> before paint when the rail is collapsed (and kept in sync by prefs.ts). */
export const RAIL_ATTR = 'data-rail-collapsed';

/**
 * The dashboard's routes. The root layout's pre-paint script only touches
 * <html> on these paths, so dashboard preferences never reach the landing.
 */
export const DASHBOARD_PATH_RE = '^/(overview|repos|runs|findings|suppressions|audit|accuracy|settings|cost)(/|$)';
