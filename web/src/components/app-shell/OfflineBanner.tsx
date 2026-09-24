'use client';
// OWNER: t9a (wave 2). Brand-gaps §F "Dashboard offline": not a page, a 32px
// --marker band pinned under the top bar. Fires on two signals — the browser
// says it is offline (`onlineManager`, the same source TanStack Query itself
// pauses retries on), or three consecutive query failures land regardless of
// what `navigator.onLine` claims (a captive portal or a dead API answers
// `online: true` and every request 5xxs). Cached data stays rendered at full
// opacity elsewhere in the app — dimming stale-but-valid data would be a lie
// about its validity, so this component never touches anything but its own band.
import { useEffect, useRef, useState } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { isTransientError } from '@/lib/hooks';
import { Warn } from '@/components/icons';

const FAILURE_STREAK_THRESHOLD = 3;

function useOfflineStatus(): { offline: boolean; lastSuccessAt: number | null; now: number | null } {
  const queryClient = useQueryClient();
  const [browserOnline, setBrowserOnline] = useState(() => onlineManager.isOnline());
  const [failing, setFailing] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // Read only from inside the subscribe callback below, never during render.
  const streakRef = useRef(0);

  useEffect(() => onlineManager.subscribe(() => setBrowserOnline(onlineManager.isOnline())), []);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      const state = event.query.state;
      if (state.status === 'success') {
        streakRef.current = 0;
        setLastSuccessAt(state.dataUpdatedAt || Date.now());
        setFailing(false);
      } else if (state.status === 'error' && isTransientError(state.error)) {
        streakRef.current += 1;
        if (streakRef.current >= FAILURE_STREAK_THRESHOLD) setFailing(true);
      }
    });
  }, [queryClient]);

  // 1Hz so "Ns ago" advances without waiting on the next query event.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return { offline: !browserOnline || failing, lastSuccessAt, now };
}

export function OfflineBanner() {
  const { offline, lastSuccessAt, now } = useOfflineStatus();
  if (!offline) return null;
  const ageS = lastSuccessAt !== null && now !== null ? Math.max(0, Math.round((now - lastSuccessAt) / 1000)) : null;
  return (
    <div role="status" className="flex h-8 items-center gap-2 border-b border-marker bg-marker-tint px-4" data-offline-banner="">
      <Warn className="text-marker" />
      <p className="type-data text-marker-text">
        OFFLINE {ageS !== null ? `· last successful poll ${ageS}s ago` : ''} · retrying
      </p>
    </div>
  );
}
