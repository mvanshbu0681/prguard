// OWNER: t9a (wave 2). The brief's own test list: "route list in the sidebar
// matches the eight routes" (plan A3) and the go-to chord map this track's
// keyboard binding and shortcut sheet both read from.
import { describe, expect, it } from 'vitest';
import { APP_NAV_ITEMS, breadcrumbsForPath, CHORD_MAP, isActiveNavItem, navItemsByGroup, shortSegment } from '@/components/app-shell/routes';

describe('APP_NAV_ITEMS', () => {
  it('has exactly the eight navigable routes (/runs/:id, /findings/:id and repo pages are row-reached)', () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual(['/overview', '/repos', '/runs', '/findings', '/suppressions', '/audit', '/accuracy', '/settings/policy']);
  });

  it('groups Workspace · Governance · Settings, in that order', () => {
    expect(navItemsByGroup('Workspace').map((i) => i.label)).toEqual(['Overview', 'Repositories', 'Reviews', 'Findings']);
    expect(navItemsByGroup('Governance').map((i) => i.label)).toEqual(['Suppressions', 'Audit', 'Accuracy']);
    expect(navItemsByGroup('Settings').map((i) => i.label)).toEqual(['Policy']);
  });

  it('every item is keyboard-reachable via a unique go-to chord (g then o/r/v/f/s/a/c/p)', () => {
    const chords = APP_NAV_ITEMS.map((item) => item.chord);
    expect(chords).toEqual(['o', 'r', 'v', 'f', 's', 'a', 'c', 'p']);
    expect(new Set(chords).size).toBe(chords.length);
  });
});

describe('CHORD_MAP', () => {
  it('resolves every chord letter to its route', () => {
    expect(CHORD_MAP.get('o')?.href).toBe('/overview');
    expect(CHORD_MAP.get('r')?.href).toBe('/repos');
    expect(CHORD_MAP.get('v')?.href).toBe('/runs');
    expect(CHORD_MAP.get('f')?.href).toBe('/findings');
    expect(CHORD_MAP.get('s')?.href).toBe('/suppressions');
    expect(CHORD_MAP.get('a')?.href).toBe('/audit');
    expect(CHORD_MAP.get('c')?.href).toBe('/accuracy');
    expect(CHORD_MAP.get('p')?.href).toBe('/settings/policy');
  });

  it('has no entry for an unbound letter', () => {
    expect(CHORD_MAP.get('x')).toBeUndefined();
  });
});

describe('isActiveNavItem', () => {
  it('matches the item and the pages beneath it, never a prefix sibling', () => {
    expect(isActiveNavItem('/findings', '/findings')).toBe(true);
    expect(isActiveNavItem('/findings/abc', '/findings')).toBe(true);
    expect(isActiveNavItem('/findingsx', '/findings')).toBe(false);
  });
});

describe('shortSegment', () => {
  it('keeps a short or word-like segment as is', () => {
    expect(shortSegment('policy')).toBe('policy');
    expect(shortSegment('overview')).toBe('overview');
  });

  it('shortens a long id-shaped segment to 8 characters', () => {
    expect(shortSegment('4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41')).toBe('4e8b1d0c');
  });
});

describe('breadcrumbsForPath', () => {
  it('resolves a known root segment to its label', () => {
    expect(breadcrumbsForPath('/findings')).toEqual([{ label: 'Findings', href: '/findings' }]);
  });

  it('builds a crumb per segment, shortening a trailing id but keeping the full href', () => {
    const id = '4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41';
    expect(breadcrumbsForPath(`/runs/${id}`)).toEqual([
      { label: 'Reviews', href: '/runs' },
      { label: '4e8b1d0c', href: `/runs/${id}` },
    ]);
  });

  it('collapses repository pages to Repositories › name › #number', () => {
    expect(breadcrumbsForPath('/repos/acme/checkout-service/pulls/4821')).toEqual([
      { label: 'Repositories', href: '/repos' },
      { label: 'checkout-service', href: '/repos/acme/checkout-service' },
      { label: '#4821', href: '/repos/acme/checkout-service/pulls/4821' },
    ]);
    expect(breadcrumbsForPath('/repos/acme/ledger')).toHaveLength(2);
  });

  it('is empty at the root', () => {
    expect(breadcrumbsForPath('/')).toEqual([]);
  });
});
