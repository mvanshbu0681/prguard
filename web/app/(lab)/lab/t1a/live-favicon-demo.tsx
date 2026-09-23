'use client';
// OWNER: t1a (wave 1). Lab only: the live favicon's frames, drawn by the real
// canvas code, and a switch that drives the real hook. Keys R / C / B / O set
// running / clear / blocked / off, so a scripted key press proves the swap.
import { useEffect, useState } from 'react';
import { LIVE_FAVICON_SIZE, paintLiveFavicon, useLiveFavicon, type LiveFaviconState, type MarkLiveState } from '@/components/brand';

// running: the dip frame shows for the first 12% of each 1200ms beat, the
// bright frame for the other 88% (@keyframes tick on steps(1, end)).
const STATES: { state: MarkLiveState; beat: 'on' | 'rest'; label: string }[] = [
  { state: 'running', beat: 'rest', label: 'running · dip 0.35, 0–12%' },
  { state: 'running', beat: 'on', label: 'running · 12–100%' },
  { state: 'clear', beat: 'on', label: 'clear' },
  { state: 'blocked', beat: 'on', label: 'blocked' },
];

const KEYS: Record<string, LiveFaviconState> = { r: 'running', c: 'clear', b: 'blocked', o: null };

function useFrames() {
  const [frames, setFrames] = useState<string[] | null>(null);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = LIVE_FAVICON_SIZE;
    canvas.height = LIVE_FAVICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const urls = STATES.map(({ state, beat }) => {
      paintLiveFavicon(ctx, state, beat);
      return canvas.toDataURL('image/png');
    });
    // Canvas output exists only in the browser; this runs once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrames(urls);
  }, []);
  return frames;
}

function useIconHref(state: LiveFaviconState) {
  const [href, setHref] = useState('');
  useEffect(() => {
    const read = () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      const value = link?.getAttribute('href') ?? '(none)';
      setHref(value.startsWith('data:') ? `data:image/png;base64 · ${value.length} chars` : value);
    };
    read();
    const timer = window.setInterval(read, 150);
    return () => window.clearInterval(timer);
  }, [state]);
  return href;
}

export function LiveFaviconDemo() {
  const [state, setState] = useState<LiveFaviconState>(null);
  const frames = useFrames();
  // The swap first, then the readout: effects run in call order, so the
  // readout's immediate read sees the new href rather than the old one.
  useLiveFavicon(state);
  const href = useIconHref(state);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
      const key = e.key.toLowerCase();
      if (key in KEYS) setState(KEYS[key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-6">
        {STATES.map(({ label }, i) => (
          <figure key={label} className="m-0 grid justify-items-start gap-2">
            <div className="flex items-end gap-3">
              {frames ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn at runtime */}
                  <img src={frames[i]} width={32} height={32} alt="" className="block" style={{ imageRendering: 'pixelated' }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frames[i]} width={16} height={16} alt="" className="block" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frames[i]} width={96} height={96} alt="" className="block" style={{ imageRendering: 'pixelated' }} />
                </>
              ) : (
                <span className="block size-24 bg-ink-1" />
              )}
            </div>
            <figcaption className="type-data text-text-dim">{label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tab icon state">
        {(['running', 'clear', 'blocked', null] as const).map((s) => (
          <button
            key={String(s)}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className="h-8 rounded-data border border-rule-2 px-4 type-label text-text-body transition-colors hover:border-rule-3 hover:bg-ink-2 aria-pressed:border-ink-7 aria-pressed:bg-ink-3 aria-pressed:text-text-primary"
          >
            {s ?? 'off'}
          </button>
        ))}
      </div>
      <p className="type-data text-text-dim [overflow-wrap:anywhere]" data-testid="icon-href">
        state {state ?? 'off'} · link[rel=icon] href → {href}
      </p>
    </div>
  );
}
