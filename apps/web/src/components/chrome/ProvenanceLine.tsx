// OWNER: t1a (wave 1).
//
// <ProvenanceLine> — the address of what you are looking at (design §4.4, R10):
//   GET /v1/reviews/4e8b1d0/result → findings[0].proof · captured 2026-09-19T14:22:07Z
// 11px mono, --text-dim, tracking 0. It says the artifact has a source, not a
// designer, and on the dashboard it doubles as a debugging affordance.
//
// `ext` marks data the API does not serve yet (plan A11, fixtures README "Ext"):
// the line then ends " · fixture-only: not served by the API yet".
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const PROVENANCE_EXT_NOTE = 'fixture-only: not served by the API yet';

export interface ProvenanceLineProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** The endpoint and path the data came from, e.g. "GET /v1/findings/a91f3c2e → severity". */
  source: ReactNode;
  /** ISO 8601 UTC with Z. Rendered as "captured <ISO>" in a <time>. A Date is printed to the second. */
  capturedAt?: string | Date;
  /** The shape exists only in fixtures (plan A11). */
  ext?: boolean;
  as?: 'p' | 'div' | 'span';
}

/** ISO 8601 UTC to the second, with Z (numeric style, brand-gaps §D). */
export function formatCaptured(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// A line may break before a " · " segment, never inside one: the dot binds to
// the word after it (no-break space) and the timestamp never wraps at its hyphens.
const NBSP = ' ';
const EXT_HEAD = PROVENANCE_EXT_NOTE.slice(0, PROVENANCE_EXT_NOTE.indexOf(' '));
const EXT_TAIL = PROVENANCE_EXT_NOTE.slice(EXT_HEAD.length);

export function ProvenanceLine({ source, capturedAt, ext = false, as: Tag = 'p', className, ...rest }: ProvenanceLineProps) {
  const captured = capturedAt === undefined ? null : formatCaptured(capturedAt);
  return (
    <Tag {...rest} className={cn('prg-provenance', className)} data-provenance="">
      <span data-provenance-part="source">{source}</span>
      {captured ? (
        <span data-provenance-part="captured">
          {` ·${NBSP}captured${NBSP}`}
          <time dateTime={captured}>{captured}</time>
        </span>
      ) : null}
      {ext ? (
        <span data-provenance-part="ext">
          {` ·${NBSP}`}
          {/* "fixture-only:" never splits at its hyphen. */}
          <span className="whitespace-nowrap">{EXT_HEAD}</span>
          {EXT_TAIL}
        </span>
      ) : null}
    </Tag>
  );
}
