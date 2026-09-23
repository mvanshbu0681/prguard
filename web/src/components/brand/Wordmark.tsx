// OWNER: t1a (wave 1).
//
// <Wordmark> — PRGUARD (brand-gaps §B): Google Sans Code 560 on the variable
// axis, all caps, +0.04em, --text-primary. The mark carries the accent; the
// wordmark never does. 15px in the nav, 20px in the footer, never below 12px.
//
// The DOM text is the prose spelling "PRGuard" and CSS sets the caps. The eye
// gets PRGUARD; a screen reader gets a pronounceable name instead of seven
// spelled-out letters. If the stylesheet is missing, the fallback is still the
// correct prose form of the name.
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { WORDMARK_MIN } from './metrics';

export interface WordmarkProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Font size in CSS px. Default 15 (nav); 20 in the footer. Clamped to ≥ 12. */
  size?: number;
  as?: 'span' | 'p' | 'div';
}

export function Wordmark({ size = 15, as: Tag = 'span', className, style, ...rest }: WordmarkProps) {
  const px = Math.max(WORDMARK_MIN, size);
  return (
    <Tag {...rest} className={cn('prg-wordmark', className)} style={{ ...style, fontSize: `${px}px` }}>
      PRGuard
    </Tag>
  );
}
