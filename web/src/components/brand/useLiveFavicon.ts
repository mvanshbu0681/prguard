'use client';
// OWNER: t1a (wave 1).
//
// useLiveFavicon(state) — swap the tab icon to the live-state mark while a
// review runs, and put the original icons back on unmount (brand-gaps §C).
//
//   useLiveFavicon(run.status === 'running' ? 'running'
//                : gate === 'failure' ? 'blocked'
//                : gate ? 'clear' : null);
//
// null restores the static icons without unmounting. Pass the run's real
// heartbeat interval as `periodMs` when the API provides it; the default is
// the 1200ms poll interval. See ./live-favicon for the drawing and the rules.
import { useEffect, useRef } from 'react';
import { createLiveFavicon, type LiveFaviconController, type LiveFaviconState } from './live-favicon';

export type { LiveFaviconState } from './live-favicon';

export function useLiveFavicon(state: LiveFaviconState, options: { periodMs?: number } = {}): void {
  const { periodMs } = options;
  const controller = useRef<LiveFaviconController | null>(null);

  useEffect(() => {
    const live = createLiveFavicon({ periodMs });
    controller.current = live;
    return () => {
      live.destroy();
      if (controller.current === live) controller.current = null;
    };
  }, [periodMs]);

  useEffect(() => {
    controller.current?.set(state);
  }, [state, periodMs]);
}
