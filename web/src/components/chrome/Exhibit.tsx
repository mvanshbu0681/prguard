// OWNER: t1a (wave 1).
//
// <Exhibit> — the evidence frame (design §4.4, §4.5, §5.3; plan §2 hard rule 1).
//
//   ┌ / 05 — COMPUTED SEVERITY · finding a91f3c2e ──────────────── meta ┐   index strip, 28px
//   │  the artifact, at full fidelity                                   │   body
//   └ GET /v1/reviews/4e8b1d0/result → findings[0].proof · captured … ──┘   provenance strip, 24px
//
// A level-2 Surface plus the bracket plus FOUR 8px L-shaped registration marks
// at the corners (--registration 0.10, 0.22 on hover over 120ms; the hairline
// steps --rule-1 → --rule-2; the fill never changes — hover class A).
//
// HARD RULE: this file is the only place registration marks are rendered, so
// misuse is grep-able (`prg-exhibit__mark`, `data-registration-mark`). Use
// Exhibit only for evidence-bearing frames — the proof bench, the severity
// instrument, the audit chain, the diff — on both surfaces (brand-gaps §2
// ruling 12). Never on buttons, chips, nav or ordinary panels: those take a
// <Surface> with <IndexStrip>/<ProvenanceStrip> and no marks.
//
// `provenance` is required (R10: every evidence frame names its endpoint).
import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ProvenanceLine, type ProvenanceLineProps } from './ProvenanceLine';
import { IndexLabel, type IndexLabelProps, type IndexParts } from './SectionIndex';

export type ExhibitDensity = 'full' | 'compact';

// ---------------------------------------------------------------------------
// Strips — the bracket, usable on any panel (dashboard §0 rule 1).
// ---------------------------------------------------------------------------

export interface IndexStripProps extends IndexParts, Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Right-aligned slot: a state chip, a heartbeat, a count. Wraps below the label at narrow widths. */
  meta?: ReactNode;
  as?: 'div' | 'header' | 'figcaption';
  labelAs?: IndexLabelProps['as'];
  /** id on the label itself (not the strip), for aria-labelledby. */
  labelId?: string;
  /** Standalone strips only: compact = 24px strip, 12px inset. Inside an Exhibit the frame's density applies. */
  density?: ExhibitDensity;
}

export function IndexStrip({ index, category, identifier, meta, as: Tag = 'div', labelAs = 'p', labelId, density, className, ...rest }: IndexStripProps) {
  return (
    <Tag {...rest} className={cn('prg-strip', className)} data-strip="index" data-density={density}>
      <IndexLabel as={labelAs} id={labelId} index={index} category={category} identifier={identifier} />
      {meta ? <div className="prg-strip__meta">{meta}</div> : null}
    </Tag>
  );
}

export interface ProvenanceStripProps extends Omit<ProvenanceLineProps, 'as'> {
  density?: ExhibitDensity;
}

export function ProvenanceStrip({ source, capturedAt, ext, density, className, ...rest }: ProvenanceStripProps) {
  return (
    <div className={cn('prg-strip', className)} data-strip="provenance" data-density={density}>
      <ProvenanceLine {...rest} source={source} capturedAt={capturedAt} ext={ext} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exhibit
// ---------------------------------------------------------------------------

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

export interface ExhibitProps extends IndexParts, Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** The endpoint and path the artifact came from (R10) — required. */
  provenance: ReactNode;
  /** ISO 8601 UTC; appended to the provenance strip as "captured <ISO>". */
  capturedAt?: string | Date;
  /** Fixture-only shape (plan A11): appends " · fixture-only: not served by the API yet". */
  ext?: boolean;
  /** Right-aligned slot in the index strip. */
  meta?: ReactNode;
  /** full: 28px index strip, 16px inset (default) · compact: 24px, 12px — dense dashboard frames. */
  density?: ExhibitDensity;
  /** panel: 4px (default) · container: 6px — the largest instance only (the hero bench). */
  radius?: 'panel' | 'container';
  /** Pad the body by the frame inset. Off by default: terminals and rails run edge to edge. */
  padded?: boolean;
  /** Hold the hover state (marks at 0.22, hairline --rule-2): lab pages, screenshots. */
  forceHover?: boolean;
  /** figure (default; the index names it) · section · article · div. */
  as?: 'figure' | 'section' | 'article' | 'div';
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  children?: ReactNode;
}

export function Exhibit({
  index,
  category,
  identifier,
  provenance,
  capturedAt,
  ext = false,
  meta,
  density = 'full',
  radius = 'panel',
  padded = false,
  forceHover = false,
  as: Tag = 'figure',
  headerClassName,
  bodyClassName,
  footerClassName,
  className,
  children,
  ...rest
}: ExhibitProps) {
  const labelId = useId();
  const named = Tag !== 'div';
  return (
    <Tag
      {...rest}
      className={cn('prg-exhibit', className)}
      data-exhibit=""
      data-density={density}
      data-radius={radius}
      data-hover={forceHover ? '' : undefined}
      aria-labelledby={named ? (rest['aria-labelledby'] ?? labelId) : rest['aria-labelledby']}
    >
      <IndexStrip
        as={Tag === 'figure' ? 'figcaption' : 'div'}
        labelId={labelId}
        index={index}
        category={category}
        identifier={identifier}
        meta={meta}
        className={headerClassName}
      />
      <div className={cn('prg-exhibit__body', bodyClassName)} data-padded={padded ? '' : undefined}>
        {children}
      </div>
      <ProvenanceStrip source={provenance} capturedAt={capturedAt} ext={ext} className={footerClassName} />
      {CORNERS.map((corner) => (
        <span key={corner} className="prg-exhibit__mark" data-corner={corner} data-registration-mark="" aria-hidden="true" />
      ))}
    </Tag>
  );
}
