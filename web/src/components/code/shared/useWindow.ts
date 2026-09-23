// OWNER: t1d (wave 1). Windowing for long captures — the client half. Imported only by the
// "use client" windowed bodies (TerminalWindow, CodeWindow, DiffWindow); the pure half and the
// reasons are in ./windowing.ts.
//
//   useWindow      TanStack Virtual over one scroll viewport: which rows to render, and the
//                  spacer heights around them. Rows are one line box tall (the line-height is
//                  read from the pane, so a phone terminal's 20px rows stay exact); only
//                  content hung between rows is measured.
//   useWindowCopy  copy fidelity: a copy inside the region is answered from the captured text,
//                  the rows under a selection's two ends stay rendered while it scrolls, and
//                  select-all inside the focused region means every line, rendered or not.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { defaultRangeExtractor, observeElementRect, useVirtualizer, type Range, type Rect, type Virtualizer } from "@tanstack/react-virtual";
import {
  BLOCK_ESTIMATE,
  OVERSCAN,
  ROW_HEIGHT,
  SHEET_PADDING,
  allText,
  layoutRuns,
  sliceText,
  withPinned,
  type TextPoint,
  type WindowLayout,
} from "./windowing";

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

const NO_PINS: readonly number[] = Object.freeze([]);

/** A rendered row: every [data-index] element except content hung between rows. */
const ROW_SELECTOR = "[data-index]:not([role='note'])";

// ------------------------------------------------------------------ the window

export interface UseWindowOptions {
  count: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Viewport height for the first render (server and hydration) and whenever the pane
   *  reports no height (hidden, or no layout): the rows a reader sees before any script. */
  initialHeight: number;
  /** Rows to keep rendered wherever the view is (a selection's ends). */
  pinned?: readonly number[];
  /** Content hung between rows (the diff's annotations): estimated, then measured. */
  isBlock?: (index: number) => boolean;
  /** Stable key per item when blocks are present, so measured sizes follow their content. */
  getItemKey?: (index: number) => string | number;
}

export interface WindowState {
  layout: WindowLayout;
  /** Ref callback for a block element; it must carry data-index. */
  measureBlock: (element: Element | null) => void;
}

function readRowHeight(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).lineHeight);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : ROW_HEIGHT;
}

export function useWindow({ count, scrollRef, initialHeight, pinned = NO_PINS, isBlock, getItemKey }: UseWindowOptions): WindowState {
  const rowHeight = useRef(ROW_HEIGHT);
  const rangeExtractor = useCallback((range: Range) => withPinned(defaultRangeExtractor(range), pinned, range.count), [pinned]);
  const observeRect = useCallback(
    (instance: Virtualizer<HTMLDivElement, Element>, cb: (rect: Rect) => void) =>
      observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : { width: rect.width, height: initialHeight })),
    [initialHeight],
  );

  // The virtualizer re-renders this component through its own onChange; nothing here is
  // memoised by a compiler, so the non-memoisable API the lint rule warns about is fine.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (isBlock?.(index) ? BLOCK_ESTIMATE : rowHeight.current),
    getItemKey,
    overscan: OVERSCAN,
    paddingStart: SHEET_PADDING,
    paddingEnd: SHEET_PADDING,
    initialRect: { width: 0, height: initialHeight },
    rangeExtractor,
    observeElementRect: observeRect,
    useFlushSync: false,
  });

  // The real row height: 22px, or 20px for a terminal below 768px. Re-read whenever the pane
  // resizes (crossing the breakpoint changes it); a change re-lays every row, and blocks that
  // are already on screen are measured again.
  useIsomorphicLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const next = readRowHeight(element);
      if (next === rowHeight.current) return;
      rowHeight.current = next;
      virtualizer.measure();
      virtualizer.elementsCache.forEach((node) => virtualizer.measureElement(node));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef, virtualizer]);

  const layout = layoutRuns(virtualizer.getVirtualItems(), virtualizer.getTotalSize(), SHEET_PADDING);
  return { layout, measureBlock: virtualizer.measureElement };
}

// ------------------------------------------------------------------ copy fidelity

interface ScopedPoint extends TextPoint {
  /** The split diff's side (pre[data-side]); undefined everywhere else. */
  scope: string | undefined;
}

function rowOf(body: Element, node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  const row = element?.closest<HTMLElement>("[data-index]") ?? null;
  return row && body.contains(row) && row.getAttribute("role") !== "note" ? row : null;
}

function scopeOf(row: Element): string | undefined {
  return row.closest<HTMLElement>("pre[data-side]")?.dataset.side;
}

function indexOf(row: HTMLElement): number {
  return Number(row.dataset.index);
}

/** A DOM boundary point → a point in the captured text. Inside a row: characters from the
 *  row's start (its gutter is CSS content and contributes none). Between rows (a newline, a
 *  spacer, an annotation, the sheet): the nearest rendered row on the inside of the range. */
export function resolvePoint(body: Element, node: Node, offset: number, edge: "start" | "end"): ScopedPoint | null {
  if (!body.contains(node)) return null;
  const row = rowOf(body, node);
  if (row) {
    const range = document.createRange();
    range.setStart(row, 0);
    range.setEnd(node, offset);
    return { index: indexOf(row), offset: range.toString().length, scope: scopeOf(row) };
  }
  const probe = document.createRange();
  probe.setStart(node, offset);
  probe.collapse(true);
  const rows = body.querySelectorAll<HTMLElement>(ROW_SELECTOR);
  if (edge === "start") {
    for (const candidate of rows) {
      if (probe.comparePoint(candidate, 0) >= 0) return { index: indexOf(candidate), offset: 0, scope: scopeOf(candidate) };
    }
    return null;
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const candidate = rows[i];
    if (probe.comparePoint(candidate, candidate.childNodes.length) <= 0) {
      return { index: indexOf(candidate), offset: candidate.textContent?.length ?? 0, scope: scopeOf(candidate) };
    }
  }
  return null;
}

/** The captured text a copy of the current selection inside `body` should yield, or null to
 *  leave the copy to the browser (a selection that leaves the surface, or spans both sides of
 *  a split diff). */
export function copyText(
  body: Element,
  selection: Selection,
  count: number,
  textOf: (index: number, scope: string | undefined) => string | null,
  all: boolean,
  every?: () => string,
): string | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return null;
  if (all) return every ? every() : allText((i) => textOf(i, undefined), count);
  const start = resolvePoint(body, range.startContainer, range.startOffset, "start");
  const end = resolvePoint(body, range.endContainer, range.endOffset, "end");
  if (!start || !end || start.scope !== end.scope) return null;
  // Both ends between the same two rows (a selection inside an annotation's card): that text
  // is the card's, and the browser copies it.
  if (start.index > end.index || (start.index === end.index && start.offset > end.offset)) return null;
  return sliceText((i) => textOf(i, start.scope), start, end);
}

export interface UseWindowCopyOptions {
  /** The element whose descendants are the rows: the <code>, or the diff's sheet. */
  bodyRef: RefObject<HTMLElement | null>;
  count: number;
  /** Row text as captured; `scope` is the split diff's side, undefined for select-all.
   *  Null for anything that is not a row (it contributes nothing to a copy). */
  textOf: (index: number, scope: string | undefined) => string | null;
  /** What select-all copies, when it is not every item's textOf (the diff: every row of the
   *  diff in unified order, in either view). */
  allText?: () => string;
}

export interface WindowCopy {
  /** Rows under the selection's anchor and focus: keep them rendered (useWindow `pinned`). */
  pinned: readonly number[];
  /** For the viewport: select-all inside the focused region selects every line. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function samePins(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isSelectAll(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a";
}

export function useWindowCopy({ bodyRef, count, textOf, allText: every }: UseWindowCopyOptions): WindowCopy {
  const [pinned, setPinned] = useState<readonly number[]>(NO_PINS);
  // "Every line" mode: entered by select-all inside the region, left by any new selection.
  const all = useRef(false);
  const latest = useRef({ count, textOf, every });
  useIsomorphicLayoutEffect(() => {
    latest.current = { count, textOf, every };
  });

  useEffect(() => {
    const onSelectionChange = () => {
      const body = bodyRef.current;
      const selection = document.getSelection();
      if (!body || !selection || selection.rangeCount === 0) {
        all.current = false;
        setPinned((prev) => (prev.length ? NO_PINS : prev));
        return;
      }
      const inside = body.contains(selection.anchorNode) && body.contains(selection.focusNode);
      if (selection.isCollapsed || !inside) all.current = false;
      const next = [rowOf(body, selection.anchorNode), rowOf(body, selection.focusNode)]
        .filter((row): row is HTMLElement => row !== null)
        .map(indexOf)
        .filter((index, i, list) => list.indexOf(index) === i)
        .sort((a, b) => a - b);
      setPinned((prev) => (samePins(prev, next) ? prev : next.length ? next : NO_PINS));
    };
    // A press on the text starts or extends a selection; a press on the scrollbar (the viewport
    // itself, outside the body) or elsewhere on the page leaves "every line" alone.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && bodyRef.current?.contains(event.target)) all.current = false;
    };
    const onCopy = (event: ClipboardEvent) => {
      const body = bodyRef.current;
      const selection = document.getSelection();
      if (!body || !selection || !event.clipboardData) return;
      // A copy from a field (a search box beside the pane) is the field's own.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return;
      const current = latest.current;
      const text = copyText(body, selection, current.count, current.textOf, all.current, current.every);
      if (text === null) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("copy", onCopy);
    };
  }, [bodyRef]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!isSelectAll(event)) {
        // Copying keeps the mode; a key that moves or extends the selection leaves it.
        const copying = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
        if (!copying && !["Meta", "Control", "Shift", "Alt"].includes(event.key)) all.current = false;
        return;
      }
      const body = bodyRef.current;
      const selection = document.getSelection();
      if (!body || !selection) return;
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(body);
      selection.removeAllRanges();
      selection.addRange(range);
      all.current = true;
    },
    [bodyRef],
  );

  return { pinned, onKeyDown };
}
