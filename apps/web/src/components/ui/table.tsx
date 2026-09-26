// OWNER: T1b (wave 1). Design §5.5, dashboard §0.2 and §2.0, motion §4.2.2.
// No hooks: renders in a Server Component.
//
//   <Table density="compact">          data-density on <table>: 32px rows, 26px compact
//     <TableHeader><TableRow><TableHead>SCORE</TableHead>…</TableRow></TableHeader>
//     <TableBody>
//       <TableRow data-state="selected">…</TableRow>   ink-4 + a 2px --signal-lo rail
//       <TableSkeletonRows rows={8} columns={6} />     the loading state, at the same density
//     </TableBody>
//   </Table>
//
// Cells default to 12.5px Google Sans Code, tabular, tracking 0; kind="prose"
// is 13px Inter (still tabular numerals). Separators are --rule-hair hairlines,
// bottom only — never zebra stripes. The header is a solid --ink-2 sticky row
// (no blur). Row hover steps exactly one rung, ink-2 → ink-3, in 120ms: the
// container paints ink-2 so that holds wherever the table sits.
//
// The header sticks within the table's own scroll container: give it a height
// (containerClassName="max-h-[480px]") for a scrolling table. A roving-focus
// row (j/k) gets an inset 2px ring and scroll-margin-top = the sticky header
// height (SC 2.4.11). Set --ui-sticky-top if an app header also sits above it.
import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type TableDensity = "default" | "compact";

/** Row heights in px, per density (design §5.5). ui.css declares the same values. */
export const TABLE_ROW_HEIGHT: Record<TableDensity, number> = { default: 32, compact: 26 };

export interface TableProps extends React.ComponentProps<"table"> {
  density?: TableDensity;
  /** Classes for the scroll container (height, border, radius). */
  containerClassName?: string;
}

function Table({ className, density = "default", containerClassName, ...props }: TableProps) {
  return (
    <div data-slot="table-container" className={cn("ui-table-wrap", containerClassName)}>
      <table data-slot="table" data-density={density} className={cn("ui-table", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={className} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-head" scope={props.scope ?? "col"} className={className} {...props} />;
}

export interface TableCellProps extends React.ComponentProps<"td"> {
  /** data (default): mono 12.5px. prose: Inter 13px, for titles and sentences. */
  kind?: "data" | "prose";
}

function TableCell({ className, kind = "data", ...props }: TableCellProps) {
  return <td data-slot="table-cell" data-kind={kind} className={className} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={className} {...props} />;
}

/** Skeleton bar widths per column: fixed, so every render (and every screenshot) is identical. */
const SKELETON_WIDTHS = ["72%", "48%", "86%", "36%", "60%", "42%", "78%", "54%"];

export interface TableSkeletonRowsProps {
  rows?: number;
  columns: number;
}

/** The loading body (dashboard §2.0): N static rows at the table's density. No shimmer. */
function TableSkeletonRows({ rows = 8, columns }: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} data-slot="table-skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}>
              <Skeleton className="ui-table__skeleton-bar" style={{ width: SKELETON_WIDTHS[(r + c * 3) % SKELETON_WIDTHS.length] }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, TableSkeletonRows };
