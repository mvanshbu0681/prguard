// <Mark> — THE WITNESS EYE, static (./geometry has the construction). `size`
// is the rendered edge in CSS px; the eye scales through the viewBox, so it is
// the same drawing at every size. `frame` sets how much of that edge it fills.
//
// Colour: tone="signal" draws in --signal (default, dark surfaces) · "mono"
// in --text-primary · "ink" in --ink-0, for light print contexts · forced
// colours: CanvasText. One colour per mark; --alarm appears only on the pupil
// of a blocked live review.
//
// Decorative by default (aria-hidden): next to the wordmark the name is already
// in the DOM. Pass `title` when the mark stands alone (Lockup D does).
// <TrackingMark> is the animated variant for the marketing nav and footer.
import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { markGeometry, markParts, markViewBox, type MarkFrame, type MarkLiveState } from './geometry';

export type MarkTone = 'signal' | 'mono' | 'ink';

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height' | 'viewBox'> {
  /** Rendered edge in CSS px. Default 24. Never drawn below 16. */
  size?: number;
  tone?: MarkTone;
  /** How much of the edge the eye fills. "circle" leaves room for a circular crop. Default "bare". */
  frame?: MarkFrame;
  /** Pupil state: running → ring · clear → solid · blocked → --alarm. */
  live?: MarkLiveState;
  /** Accessible name. Omit when the mark sits next to the wordmark (it is then decorative). */
  title?: string;
}

export function Mark({ size = 24, tone = 'signal', frame = 'bare', live, title, className, ...rest }: MarkProps) {
  const geometry = markGeometry(size, { frame });
  const parts = markParts(geometry, live);
  const named = Boolean(title);
  return (
    <svg
      {...rest}
      xmlns="http://www.w3.org/2000/svg"
      width={geometry.size}
      height={geometry.size}
      viewBox={markViewBox(geometry)}
      className={cn('prg-mark', className)}
      data-frame={frame}
      data-form={geometry.form}
      data-tone={tone}
      data-live={live}
      role={named ? 'img' : undefined}
      aria-label={named ? title : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      {parts.map((p) => (
        <path
          key={p.part}
          className={`prg-mark__${p.paint}`}
          data-part={p.part}
          data-stroked={p.stroke ? '' : undefined}
          strokeWidth={p.stroke}
          d={p.d}
        />
      ))}
    </svg>
  );
}
