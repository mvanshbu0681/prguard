// /overview's time window lives in the URL like every other route's filters
// (src/lib/hooks/url-state.ts): `?window=7d` or `?window=30d`; "All time" is the
// default and carries no parameter. Needs the NuqsAdapter (src/lib/providers.tsx).
import { createSerializer, parseAsStringLiteral, useQueryState } from 'nuqs';
import { WINDOW_KEYS, type WindowKey } from './model';

export const WINDOW_PARAM = 'window';

export const windowParser = parseAsStringLiteral(WINDOW_KEYS).withDefault('all').withOptions({ history: 'replace', clearOnDefault: true, scroll: false });

export function useOverviewWindow(): [WindowKey, (next: WindowKey) => void] {
  const [win, setWin] = useQueryState(WINDOW_PARAM, windowParser);
  return [win, (next) => void setWin(next)];
}

/** Deep link: overviewHref({ window: '7d' }) → "/overview?window=7d"; the default drops the param. */
export const overviewHref = (q: { window?: WindowKey }) => createSerializer({ [WINDOW_PARAM]: windowParser })('/overview', q);
