// OWNER: t1a (wave 1).
//
// The substrate (design §4.1–§4.3): what stops a large dark field from banding
// and from reading as an unstyled div. Static, CSS-only, no image requests, no
// canvas, no WebGL (D1). Styles: src/styles/chrome.css §1.
//
// <GraphPaper>    paints 8px/64px graph paper on its own box at --grid-alpha
//                 (0.028 marketing · 0.018 dashboard graticule · 0.07 projector).
// <Grain>         the bounded feTurbulence tile at --grain-opacity (0.035 on the
//                 marketing surface, 0 elsewhere). Fills its nearest positioned
//                 ancestor — give the parent `relative` (and ideally `isolate`).
//                 Never put it in a fixed full-viewport container.
// <HeroBackdrop>  the full hero stack: isolated ink-0 field, graph paper faded
//                 toward the fold, the one static cyan radial, grain above both.
//                 Content renders on top, untextured.
import type { ElementType, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { PolymorphicProps } from './polymorphic';

export type GraphPaperProps<T extends ElementType = 'div'> = PolymorphicProps<T>;

export function GraphPaper<T extends ElementType = 'div'>({ as, className, ...rest }: GraphPaperProps<T>) {
  const Tag: ElementType = as ?? 'div';
  return <Tag {...rest} className={cn('prg-graph-paper', className)} data-graph-paper="" />;
}

export type GrainProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export function Grain({ className, ...rest }: GrainProps) {
  return <div {...rest} aria-hidden="true" className={cn('prg-grain', className)} data-grain="" />;
}

export type HeroBackdropProps<T extends ElementType = 'section'> = PolymorphicProps<
  T,
  {
    /** Render the grain layer. Default true; it is invisible off the marketing surface anyway. */
    grain?: boolean;
  }
>;

export function HeroBackdrop<T extends ElementType = 'section'>({ as, grain = true, className, children, ...rest }: HeroBackdropProps<T>) {
  const Tag: ElementType = as ?? 'section';
  return (
    <Tag {...rest} className={cn('prg-hero-backdrop', className)} data-hero-backdrop="">
      {grain ? <Grain /> : null}
      {children}
    </Tag>
  );
}
