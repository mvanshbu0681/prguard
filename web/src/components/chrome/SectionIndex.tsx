// OWNER: t1a (wave 1).
//
// The index grammar (design §4.4, §2.3 label tier): "/ 05 — COMPUTED SEVERITY"
// with an optional identifier, " · finding a91f3c2e". 11px Google Sans Code 500,
// caps, +0.12em, --text-dim; the identifier is data — lowercase, tracking 0.
// Cap the category at four words: mono caps past that stop reading.
//
// <IndexLabel>    the bare label (the nav's live section index, panel headers).
// <SectionIndex>  the label as a marketing section head, optionally followed by
//                 the section rule: a 1px hairline with a tick at its origin
//                 (motion §4.2.4). The rule renders at full width; the motion
//                 layer may draw it in once via [data-section-rule]
//                 (scaleX 0 → 1 from the left, --dur-4) and must leave it full
//                 width under reduced motion.
// Section indices are inert (hover class F): no hover, no motion of their own.
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IndexParts {
  /** The number, e.g. "05" or "404". Rendered after "/ ". */
  index: string;
  /** e.g. "COMPUTED SEVERITY". Set in caps by CSS; four words at most. */
  category: string;
  /** Data after the category, e.g. "finding a91f3c2e". Never case-changed or tracked. */
  identifier?: ReactNode;
}

/** The plain-text form, for aria-labels, titles and tests: "/ 05 — COMPUTED SEVERITY · finding a91f3c2e". */
export function indexText({ index, category, identifier }: IndexParts): string {
  const base = `/ ${index} — ${category.toUpperCase()}`;
  return typeof identifier === 'string' && identifier ? `${base} · ${identifier}` : base;
}

export interface IndexLabelProps extends IndexParts, Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: 'p' | 'span' | 'div' | 'h2' | 'h3' | 'h4' | 'figcaption';
}

export function IndexLabel({ index, category, identifier, as: Tag = 'p', className, ...rest }: IndexLabelProps) {
  return (
    <Tag {...rest} className={cn('prg-index', className)} data-index={index}>
      {`/ ${index} — ${category}`}
      {identifier ? <span className="prg-index__id">{' · '}{identifier}</span> : null}
    </Tag>
  );
}

export interface SectionIndexProps extends IndexParts, Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Draw the section rule (hairline + tick) after the label. Default true. */
  rule?: boolean;
  /** The label's element. Default "p"; use "h2" when the index is the section's only heading. */
  labelAs?: IndexLabelProps['as'];
  /** id for the label, so a <section aria-labelledby> can name itself by its index. */
  labelId?: string;
}

export function SectionIndex({ index, category, identifier, rule = true, labelAs = 'p', labelId, className, ...rest }: SectionIndexProps) {
  return (
    <div {...rest} className={cn('prg-section-index', className)}>
      <IndexLabel as={labelAs} id={labelId} index={index} category={category} identifier={identifier} />
      {rule ? <span className="prg-section-index__rule" data-section-rule="" aria-hidden="true" /> : null}
    </div>
  );
}
