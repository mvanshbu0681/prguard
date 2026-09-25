// OWNER: t1d (wave 1). Windowing for long captures — the pure half: no React, no DOM.
//
// Past WINDOW_THRESHOLD rows a surface renders only the rows near the view (TanStack Virtual,
// design §5.7 "our own virtualized <pre>", §5.8 "virtualize above ~400 lines", dashboard §3b).
// At or below it every row is in the DOM, exactly as before. Rows are one line box each (22px,
// 20px for the terminal below 768px), so every row is the same height and only content hung
// between rows (the diff's annotations) is measured.
//
// What windowing costs, and what pays for it:
//   - a copy only sees rendered rows, so the windowed surface answers `copy` itself from the
//     captured text (sliceText), keeps the rows under a selection's ends rendered while it
//     scrolls, and turns select-all inside the region into "all N lines";
//   - the widest line may not be rendered, so the sheet's min width comes from maxColumns;
//   - find-in-page sees rendered rows only (the bench's own [search] is the answer, §3b).

/** Rows above which a surface windows. The design's "~400 lines". */
export const WINDOW_THRESHOLD = 400;

export function shouldWindow(rowCount: number): boolean {
  return rowCount > WINDOW_THRESHOLD;
}

/** --lh-terminal. The real value is read from the rendered pane (20px for a phone terminal). */
export const ROW_HEIGHT = 22;

/** The padding-block of every pre and of the diff sheet (--sp-2, code.css). */
export const SHEET_PADDING = 8;

/** Rows of a windowed viewport that was given no height: code.css caps it at
 *  min(70vh, 32 rows); this is the same height for the first render, on the server. */
export const WINDOW_ROWS = 32;

/** Estimated height of content hung beneath a diff row (the collapsed finding card, §4). */
export const BLOCK_ESTIMATE = 88;

/** Rendered beyond the visible rows on each side, so a fast scroll does not show a gap. */
export const OVERSCAN = 16;

// ------------------------------------------------------------------ columns

// Wide (two-column) code points: Hangul Jamo, CJK and its punctuation, Hangul syllables,
// CJK compatibility, vertical and full-width forms. Astral symbols (most emoji) count as
// two as well. An estimate for a minimum width, never used for layout of rendered text.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** Monospace columns a line occupies: a tab runs to the next multiple of `tabSize`. */
export function columnsOf(text: string, tabSize: number): number {
  let col = 0;
  for (const ch of text) {
    if (ch === "\t") col += tabSize - (col % tabSize);
    else if (ch.length > 1 || WIDE.test(ch)) col += 2;
    else col += 1;
  }
  return col;
}

/** The widest line, in columns. */
export function maxColumns(texts: Iterable<string>, tabSize: number): number {
  let max = 0;
  for (const text of texts) {
    // A line cannot be wider than twice its length: skip the walk when it cannot win.
    if (text.length * 2 <= max) continue;
    const cols = columnsOf(text, tabSize);
    if (cols > max) max = cols;
  }
  return max;
}

/** Digits of the largest line number, for the gutter's width (code.css widens past 3). */
export function digitsOf(n: number): number {
  return String(Math.max(0, Math.floor(Math.abs(n)))).length;
}

// ------------------------------------------------------------------ layout

export interface PlacedItem {
  index: number;
  /** Offset of the item's top from the top of the scroll content, padding included. */
  start: number;
  end: number;
}

/** A run of consecutive rendered items and the empty space above it. */
export interface WindowRun {
  from: number;
  /** Inclusive. */
  to: number;
  /** Height of the spacer above the run: from the previous run's end (or the top padding). */
  before: number;
}

export interface WindowLayout {
  runs: WindowRun[];
  /** Height of the spacer below the last run, down to the bottom padding. */
  after: number;
}

/** Group rendered items (sorted by index, not necessarily contiguous: a selection's rows stay
 *  rendered) into runs with the spacer heights between them. The sheet's own padding-block
 *  supplies the first and last `padding` px, so spacers never include it. */
export function layoutRuns(items: readonly PlacedItem[], totalSize: number, padding: number): WindowLayout {
  const runs: WindowRun[] = [];
  let cursor = padding;
  let current: WindowRun | null = null;
  let last = -2;
  for (const item of items) {
    if (current && item.index === last + 1) {
      current.to = item.index;
    } else {
      current = { from: item.index, to: item.index, before: Math.max(0, item.start - cursor) };
      runs.push(current);
    }
    last = item.index;
    cursor = item.end;
  }
  return { runs, after: Math.max(0, totalSize - padding - cursor) };
}

/** Indices the range extractor returns, plus the pinned ones, sorted and unique. */
export function withPinned(indices: readonly number[], pinned: readonly number[], count: number): number[] {
  if (!pinned.length) return [...indices];
  const set = new Set(indices);
  for (const p of pinned) if (p >= 0 && p < count) set.add(p);
  return [...set].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ copy

/** A position in the captured text: row `index`, `offset` characters into its text. */
export interface TextPoint {
  index: number;
  offset: number;
}

export function comparePoints(a: TextPoint, b: TextPoint): number {
  return a.index - b.index || a.offset - b.offset;
}

/** The captured text between two points, rows joined by "\n". A row whose text is null
 *  (content hung between rows: the diff's annotations) contributes nothing, not even a
 *  newline. Points may come in either order. */
export function sliceText(textOf: (index: number) => string | null, a: TextPoint, b: TextPoint): string {
  const [start, end] = comparePoints(a, b) <= 0 ? [a, b] : [b, a];
  if (start.index === end.index) return (textOf(start.index) ?? "").slice(start.offset, end.offset);
  const parts: string[] = [];
  const first = textOf(start.index);
  if (first !== null) parts.push(first.slice(start.offset));
  for (let i = start.index + 1; i < end.index; i++) {
    const text = textOf(i);
    if (text !== null) parts.push(text);
  }
  const last = textOf(end.index);
  if (last !== null) parts.push(last.slice(0, end.offset));
  return parts.join("\n");
}

/** Every row's text, as a select-all copy yields it. */
export function allText(textOf: (index: number) => string | null, count: number): string {
  if (count === 0) return "";
  const last = textOf(count - 1);
  return sliceText(textOf, { index: 0, offset: 0 }, { index: count - 1, offset: last?.length ?? 0 });
}

/** Read to assistive technology beside a windowed region. */
export function windowNote(rowCount: number): string {
  return `${rowCount} lines, rendered as they scroll into view. Select all inside this region to copy every line.`;
}
