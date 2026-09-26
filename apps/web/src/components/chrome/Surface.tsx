// OWNER: t1a (wave 1).
//
// <Surface> — the whole depth model (design §3.6, §5.3): one rung on the ink
// ladder + a 1px hairline + `inset 0 1px 0 var(--inset-hi)` from level 2 up.
// Zero drop shadows exist in this product (R6), and backdrop-filter is not used
// here (R7: the sticky header and the ⌘K palette only).
//
//   elevation 0   --ink-0, no edge                         page
//             1   --ink-1, --rule-hair                     sidebar, sticky header, terminal interior
//             2   --ink-2, --rule-1,  inset highlight      card, panel (default)
//             3   --ink-3, --rule-2,  inset highlight      popover
//   variant   panel  structure only, 4px radius, no padding (default)
//             card   panel + card padding (16px)
//             inset  a recessed well: 2px data radius, --rule-hair edge, no highlight
//
// `interactive` opts into hover class B (motion §7): fill one rung up and the
// hairline one step up over 120ms. Surfaces are otherwise inert. Surface never
// draws registration marks — evidence frames use <Exhibit>. Ordinary panels
// still get the bracket: compose <IndexStrip> and <ProvenanceStrip> inside.
// Styles: src/styles/chrome.css §2 (components layer, so utilities override).
import type { ElementType } from 'react';
import { cn } from '@/lib/utils';
import type { PolymorphicProps } from './polymorphic';

export type SurfaceElevation = 0 | 1 | 2 | 3;
export type SurfaceVariant = 'panel' | 'card' | 'inset';

export type SurfaceProps<T extends ElementType = 'div'> = PolymorphicProps<
  T,
  {
    elevation?: SurfaceElevation;
    variant?: SurfaceVariant;
    /** Hover class B: one ink rung + one hairline step. For clickable cards, rows, list items. */
    interactive?: boolean;
  }
>;

export function Surface<T extends ElementType = 'div'>({
  as,
  elevation = 2,
  variant = 'panel',
  interactive = false,
  className,
  ...rest
}: SurfaceProps<T>) {
  const Tag: ElementType = as ?? 'div';
  return (
    <Tag
      {...rest}
      className={cn('prg-surface', className)}
      data-elevation={elevation}
      data-variant={variant}
      data-interactive={interactive ? '' : undefined}
    />
  );
}
