// OWNER: t1a (wave 1).
//
// <Mark> — THE BENCH (brand-gaps §A): two panes, base and head, one hollow and
// one solid, a seam between them, framed by crop marks. `size` is the rendered
// edge in CSS px and it drives the mandatory simplification ladder:
//   ≥ 32   full (corner ticks + seam)   ·   20–31   no ticks   ·   ≤ 19 or crop="circle"   two bars
// Geometry is pixel-snapped per size (./geometry), so every form is crisp at 1x and 2x.
//
// Colour (brand-gaps §A): tone="signal" bars --signal, ticks --rule-2 (default,
// dark) · "mono" bars --text-primary · "ink" bars --ink-0 with 14% black ticks,
// for light print contexts · forced colours: CanvasText. Never a gradient, never
// two colours in one mark; --alarm appears only for a blocked live head bar.
//
// Decorative by default (aria-hidden): next to the wordmark the name is already
// in the DOM. Pass `title` when the mark stands alone (Lockup D does).
// `live` is the one motion the mark is permitted — the head bar's 0ms verdict
// flip — and belongs to the favicon (useLiveFavicon). The mark never animates
// in the nav, the footer or a loading state; nothing here transitions.
import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { markGeometry, markParts, type MarkCrop, type MarkLiveState } from './geometry';

export type MarkTone = 'signal' | 'mono' | 'ink';

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height' | 'viewBox'> {
  /** Rendered edge in CSS px; drives the ladder. Default 24. Never drawn below 16. */
  size?: number;
  tone?: MarkTone;
  /** "circle" forces the two-bar form at avatar proportions (bars at 56% width), for circle-cropped contexts. */
  crop?: MarkCrop;
  /** Head-bar state: running → hollow · clear → solid · blocked → --alarm. Favicon use only. */
  live?: MarkLiveState;
  /** Accessible name. Omit when the mark sits next to the wordmark (it is then decorative). */
  title?: string;
}

export function Mark({ size = 24, tone = 'signal', crop = 'square', live, title, className, ...rest }: MarkProps) {
  const geometry = markGeometry(size, { crop });
  const parts = markParts(geometry, live);
  const named = Boolean(title);
  return (
    <svg
      {...rest}
      xmlns="http://www.w3.org/2000/svg"
      width={geometry.size}
      height={geometry.size}
      viewBox={`0 0 ${geometry.size} ${geometry.size}`}
      className={cn('prg-mark', className)}
      data-form={geometry.form}
      data-tone={tone}
      data-crop={crop}
      data-live={live}
      role={named ? 'img' : undefined}
      aria-label={named ? title : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      {parts.map((p, i) => (
        <path
          key={`${p.part}-${i}`}
          className={`prg-mark__${p.paint}`}
          data-part={p.part}
          fillRule={p.fillRule}
          d={p.d}
        />
      ))}
    </svg>
  );
}
