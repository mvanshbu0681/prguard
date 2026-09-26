// OWNER: t1a (wave 1).
//
// <Lockup> — the four brand lockups (brand-gaps §B).
//   A  horizontal (default): mark, a 1px --rule-2 hairline at full cap-height,
//      the wordmark; 10px either side of the hairline. The hairline, not
//      whitespace, is the ownable detail.
//   B  A + a 1px --signal-lo rail beneath the wordmark at exactly its ink width.
//      Footer and OG card only — never the nav.
//   C  stacked: mark at 32px, 12px gap, wordmark at 15px, both centred
//      (404 page, print header, loading state).
//   D  mark only (favicon, app icon, avatar, README badge, browser tab).
//
// `size` scales A/B/D: "nav" = mark 20 / wordmark 15 / gaps 10 (the spec
// values); "footer" = the 20px footer wordmark with the mark (28) and gaps (13)
// in the same proportion — 28 is also where the mark's bar stack (14px) meets
// the 20px wordmark's cap height (14.3px). Minimum widths hold at both:
// Lockup A 96px (nav: 108px) · C 32px · mark 16px · wordmark 12px.
//
// Clear space (brand-gaps §B) is mark-height ÷ 6 on every side; nothing may
// enter it. `clearSpace` pads the lockup by exactly that, for layouts that
// would otherwise crowd it.
import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { markClearSpace } from './geometry';
import { Mark, type MarkTone } from './Mark';
import { GSC_CAP_HEIGHT, WORDMARK_INK } from './metrics';
import { Wordmark } from './Wordmark';

const em = (v: number) => `${Math.round(v * 10000) / 10000}em`;

export type LockupVariant = 'A' | 'B' | 'C' | 'D';
export type LockupSize = 'nav' | 'footer';

export const LOCKUP_SIZES = {
  nav: { mark: 20, wordmark: 15, gap: 10 },
  footer: { mark: 28, wordmark: 20, gap: 13 },
} as const satisfies Record<LockupSize, { mark: number; wordmark: number; gap: number }>;

/** Lockup C is fixed by the spec. */
export const LOCKUP_STACKED = { mark: 32, wordmark: 15, gap: 12 } as const;

export interface LockupProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant?: LockupVariant;
  /** Scales A, B and D. C is fixed (mark 32 / wordmark 15). Default "nav". */
  size?: LockupSize;
  /** Passed to the mark. "ink" also turns the wordmark and hairline ink, for light print contexts. */
  tone?: MarkTone;
  /** Pad by the clear-space rule (mark-height ÷ 6). */
  clearSpace?: boolean;
  /** Accessible name when the lockup is the mark alone (D). Default "PRGuard". */
  label?: string;
}

export function Lockup({ variant = 'A', size = 'nav', tone = 'signal', clearSpace = false, label = 'PRGuard', className, style, ...rest }: LockupProps) {
  const dims = variant === 'C' ? LOCKUP_STACKED : LOCKUP_SIZES[size];
  const vars = {
    '--prg-lockup-gap': `${dims.gap}px`,
    '--prg-lockup-rule': `${Math.round(dims.wordmark * GSC_CAP_HEIGHT)}px`,
    // Lockup B's rail, in em of the wordmark: P's left ink edge to D's right ink edge.
    ...(variant === 'B' ? { '--prg-rail-start': em(WORDMARK_INK.start), '--prg-rail-width': em(WORDMARK_INK.end - WORDMARK_INK.start) } : null),
    ...(clearSpace ? { padding: `${markClearSpace(dims.mark)}px` } : null),
    ...style,
  } as CSSProperties;

  return (
    <span {...rest} className={cn('prg-lockup', className)} data-variant={variant} data-tone={tone} style={vars}>
      {variant === 'D' ? (
        <Mark size={dims.mark} tone={tone} title={label} />
      ) : (
        <>
          <Mark size={dims.mark} tone={tone} />
          {variant === 'C' ? null : <span className="prg-lockup__rule" aria-hidden="true" />}
          <Wordmark size={dims.wordmark} className="prg-lockup__word" />
        </>
      )}
    </span>
  );
}
