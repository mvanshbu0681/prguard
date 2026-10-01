// <EyeGlyph> — the PR Guard eye at rest, in currentColor, for places that are
// not the brand's own slot: the pr-guard-beta[bot] avatars in the landing's GitHub
// mocks, badges, chips. Server-safe and decorative. The nav and footer use
// <TrackingMark>; the product chrome uses <Mark> (token-coloured).
import type { SVGProps } from 'react';
import { markGeometry, markViewBox, type MarkFrame } from './geometry';

export interface EyeGlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height' | 'viewBox'> {
  /** Rendered edge in CSS px. Default 16. */
  size?: number;
  frame?: MarkFrame;
}

export function EyeGlyph({ size = 16, frame = 'bare', ...rest }: EyeGlyphProps) {
  const g = markGeometry(size, { frame });
  return (
    <svg {...rest} xmlns="http://www.w3.org/2000/svg" width={g.size} height={g.size} viewBox={markViewBox(g)} aria-hidden="true" focusable="false">
      <path d={g.lid} fill="none" stroke="currentColor" strokeWidth={g.stroke} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={g.pupil.cx} cy={g.pupil.cy} r={g.pupil.r} fill="currentColor" />
    </svg>
  );
}
