// The GitHub mark (lucide 1.x dropped brand icons). Shaped like a LucideIcon,
// so it drops into <Button icon/chip> and <TextField icon> unchanged; it is a
// filled glyph, so strokeWidth is accepted and ignored.
import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

const GithubMarkBase = forwardRef<SVGSVGElement, LucideProps>(function GithubMark({ size = 16, color = 'currentColor', strokeWidth: _sw, absoluteStrokeWidth: _asw, className, ...rest }, ref) {
  void _sw;
  void _asw;
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} {...rest}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
});

export const GithubMark = GithubMarkBase as unknown as LucideIcon;
