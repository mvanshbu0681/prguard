"use client";
// OWNER: d2 (wave 3). /findings' desktop table (>=768px): @tanstack/react-table
// for the column model, @tanstack/react-virtual for the rows, useListKeys
// (app-shell, wave 2) for j/k/Enter (dashboard §1.5).
//
// Raised (props.ts / wave-1 gap, per plan §5's "a wave-2[-or-later] builder
// blocked on a missing field adds it to their own local type and files it"):
// src/components/ui/table.tsx's <Table> has no ref/containerRef prop, so its
// scroll container can't be handed to useVirtualizer's getScrollElement. This
// file works around it by composing the SAME primitives Table itself renders
// (TableHeader/TableRow/TableHead/TableBody/TableCell/TableSkeletonRows) inside
// its own ref'd wrapper, using the identical "ui-table-wrap"/"ui-table" class
// contract table.tsx defines — no CSS or behaviour is redefined, only the one
// outer <div>+<table> Table itself would have produced.
import { useEffect, useRef, type CSSProperties } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useListKeys } from "@/components/app-shell";
import { TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeletonRows, TABLE_ROW_HEIGHT, type TableDensity } from "@/components/ui/table";
import type { Finding } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { FINDINGS_COLUMN_COUNT, findingsColumns } from "./columns";
import type { RepoLookupEntry } from "./format";

export interface FindingsTableProps {
  rows: Finding[];
  repoLookup: Map<string, RepoLookupEntry>;
  density: TableDensity;
  /** No rows yet, first page still in flight: renders the skeleton body at the real header. */
  isInitialLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onOpenRow: (finding: Finding) => void;
  /** Scroll container height (design §5.5: "give it a height for a scrolling table"). */
  height?: string;
  className?: string;
}

/** Rows within this many virtual items of the end trigger the next page (dashboard §2.6 pagination, driven by scroll per the brief). */
const LOAD_MORE_THRESHOLD = 16;

export function FindingsTable({
  rows,
  repoLookup,
  density,
  isInitialLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onOpenRow,
  height = "calc(100dvh - 21rem)",
  className,
}: FindingsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = TABLE_ROW_HEIGHT[density];

  const table = useReactTable({
    data: rows,
    columns: findingsColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    meta: { repoLookup },
  });
  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    // jsdom (tests/unit) has no ResizeObserver; a non-zero initial rect keeps
    // virtualization exercised (a real window supersedes it on first measure).
    initialRect: { width: 1200, height: 480 },
  });
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  const { activeIndex, setActiveIndex, gridProps, rowProps } = useListKeys({
    count: tableRows.length,
    onOpen: (i) => {
      const row = tableRows[i];
      if (row) onOpenRow(row.original);
    },
  });

  // Keyboard focus is logical (the grid wrapper holds real DOM focus, per
  // useListKeys' own contract — see tests/unit/app-shell); bring the active
  // row into the virtualized viewport so j/k still reads as navigation and
  // WCAG 2.4.11's scroll-margin actually has something to scroll past.
  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer identity is stable per mount; re-running on it would fight user scroll.
  }, [activeIndex]);

  // Load more as you scroll (brief): once the rendered window nears the end
  // of what's loaded, fetch the next cursor page. The footer's own [Load
  // more] stays as the explicit, keyboard-reachable control either way.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const last = virtualRows[virtualRows.length - 1];
    if (last && last.index >= tableRows.length - LOAD_MORE_THRESHOLD) onLoadMore();
  }, [virtualRows, tableRows.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  const activeRowId = activeIndex >= 0 ? tableRows[activeIndex]?.id : undefined;

  return (
    <div
      ref={scrollRef}
      {...gridProps}
      tabIndex={0}
      aria-label="Findings"
      aria-rowcount={rows.length}
      aria-activedescendant={activeRowId ? `finding-row-${activeRowId}` : undefined}
      className={cn("ui-table-wrap overflow-auto rounded-panel border border-rule-1 outline-offset-[-2px]", className)}
      style={{ height, "--ui-sticky-top": "0px" } as CSSProperties}
      data-slot="findings-table"
    >
      <table className="ui-table" data-density={density === "compact" ? "compact" : undefined}>
        <colgroup>
          {table.getAllLeafColumns().map((column) => (
            <col key={column.id} style={{ width: (column.columnDef.meta as { width?: number } | undefined)?.width }} />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isInitialLoading ? (
            <TableSkeletonRows rows={8} columns={FINDINGS_COLUMN_COUNT} />
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr aria-hidden="true" style={{ height: paddingTop }}>
                  <td colSpan={FINDINGS_COLUMN_COUNT} style={{ padding: 0, border: "none" }} />
                </tr>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const row = tableRows[virtualRow.index];
                if (!row) return null;
                const finding = row.original;
                const rp = rowProps(virtualRow.index);
                return (
                  <TableRow
                    key={row.id}
                    id={`finding-row-${row.id}`}
                    data-index={virtualRow.index}
                    tabIndex={rp.tabIndex}
                    aria-selected={rp["aria-selected"]}
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveIndex(virtualRow.index);
                      onOpenRow(finding);
                    }}
                  >
                    {row.getVisibleCells().map((cell, i) => (
                      <TableCell
                        key={cell.id}
                        kind={cell.column.id === "title" ? "prose" : "data"}
                        style={i === 0 && finding.blocking ? { boxShadow: "inset 2px 0 0 var(--alarm)" } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden="true" style={{ height: paddingBottom }}>
                  <td colSpan={FINDINGS_COLUMN_COUNT} style={{ padding: 0, border: "none" }} />
                </tr>
              ) : null}
            </>
          )}
        </TableBody>
      </table>
    </div>
  );
}
