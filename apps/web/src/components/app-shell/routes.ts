// OWNER: t9a (wave 2). The single source of truth for the dashboard's shell:
// the eight routes (plan A3, dashboard-blueprint §1.1 as narrowed there), the
// sidebar groups (brief bullet 2: "Reviews · Governance · Settings" — the word
// Governance is deliberate), the go-to chords (§1.5, this track's letters) and
// the breadcrumb derivation TopBar renders from the pathname.
//
// Wave 3 builds the route pages; this file only names them, so a renamed route
// is a one-line change here rather than a hunt through the shell.

/** The three sidebar groups, in display order. */
export const NAV_GROUPS = ['Workspace', 'Governance', 'Settings'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface AppNavItem {
  /** The route's absolute path. */
  href: string;
  /** The sidebar / breadcrumb / palette label. */
  label: string;
  group: NavGroup;
  /** The letter after `g` that jumps here (dashboard §1.5; this track's map). */
  chord: string;
}

/**
 * The eight navigable destinations. `/runs/:id`, `/findings/:id` and the
 * repository / pull-request pages under `/repos` are reached from a row, not
 * the rail; `breadcrumbsForPath` below still names them.
 */
export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/overview', label: 'Overview', group: 'Workspace', chord: 'o' },
  { href: '/repos', label: 'Repositories', group: 'Workspace', chord: 'r' },
  { href: '/runs', label: 'Reviews', group: 'Workspace', chord: 'v' },
  { href: '/findings', label: 'Findings', group: 'Workspace', chord: 'f' },
  { href: '/suppressions', label: 'Suppressions', group: 'Governance', chord: 's' },
  { href: '/audit', label: 'Audit', group: 'Governance', chord: 'a' },
  { href: '/accuracy', label: 'Accuracy', group: 'Governance', chord: 'c' },
  { href: '/settings/policy', label: 'Policy', group: 'Settings', chord: 'p' },
] as const;

export function navItemsByGroup(group: NavGroup): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => item.group === group);
}

/** Every chord letter mapped to the item it opens, for the shortcut sheet and the key handler. */
export const CHORD_MAP: ReadonlyMap<string, AppNavItem> = new Map(APP_NAV_ITEMS.map((item) => [item.chord, item]));

/** Known-but-unbuilt paths (plan A3): the beta 404 names what exists instead. */
export const BETA_ROUTES = ['/cost', '/settings'] as const;

/** True when `pathname` is the nav item or a page beneath it (drives the active pill). */
export function isActiveNavItem(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export interface Crumb {
  label: string;
  href: string;
}

const SEGMENT_LABEL: Record<string, string> = {
  overview: 'Overview',
  runs: 'Reviews',
  findings: 'Findings',
  suppressions: 'Suppressions',
  audit: 'Audit',
  accuracy: 'Accuracy',
  repos: 'Repositories',
  cost: 'Cost & latency',
  settings: 'Settings',
  policy: 'Policy',
  members: 'Members',
  integrations: 'Integrations',
  'api-keys': 'API keys',
  budgets: 'Budgets',
  repositories: 'Repositories',
  pulls: 'Pull requests',
};

/** `a91f3c2e-…` to `a91f3c2e`: a dynamic segment reads as its short id (plan A10 style), never the whole UUID. */
export function shortSegment(segment: string): string {
  if (segment.length <= 10 || /^[a-z-]+$/.test(segment)) return segment;
  return segment.slice(0, 8);
}

function labelFor(segment: string): string {
  return SEGMENT_LABEL[segment] ?? shortSegment(segment);
}

/**
 * `/findings/a91f3c2e-…` to `[{Findings, /findings}, {a91f3c2e, /findings/a91f3c2e-…}]`.
 * The root segment always resolves to a known label; an id segment is shortened for
 * display but keeps the whole path in its href.
 */
export function breadcrumbsForPath(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  // Repository pages collapse owner/name into one crumb and "pulls/:n" into "#n":
  // /repos/acme/checkout-service/pulls/4821 → Repositories › checkout-service › #4821.
  if (segments[0] === 'repos' && segments.length >= 3) {
    const [, owner, name, pulls, number] = segments;
    const repoHref = `/repos/${owner}/${name}`;
    const crumbs: Crumb[] = [
      { label: 'Repositories', href: '/repos' },
      { label: decodeURIComponent(name), href: repoHref },
    ];
    if (pulls === 'pulls' && number) crumbs.push({ label: `#${decodeURIComponent(number)}`, href: `${repoHref}/pulls/${number}` });
    return crumbs;
  }
  const crumbs: Crumb[] = [];
  let href = '';
  for (const segment of segments) {
    href += `/${segment}`;
    crumbs.push({ label: labelFor(segment), href });
  }
  return crumbs;
}
