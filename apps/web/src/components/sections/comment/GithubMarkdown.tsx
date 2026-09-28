// OWNER: m3 (wave 3). Section 04 — "What lands in your PR" (brand-gaps §E).
//
// Renders one comment body from the demo run's real review_payload, in
// GitHub's own light PR chrome — never Witness's dark instrument-panel
// styling (that is the whole point of this section, THE IDEA in the brief).
// The payload's markdown is used verbatim; nothing here retypes a word of it.
//
// react-markdown + remark-gfm handle every GFM construct except raw HTML —
// this repo carries no rehype-raw (plan §14: no new dependencies), and the
// one raw-HTML construct the corpus actually contains is a single
// <details><summary>…</summary>…</details> terminal block (brand-gaps §E:
// "Terminal output is always inside <details>"). splitOnDetails below lifts
// that one block out, renders the markdown either side of it through
// react-markdown, and renders the block itself as a native <details> (closed
// by default — no JS needed for the collapse).
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface DetailsBlock {
  summary: string;
  code: string;
}

interface Segments {
  before: string;
  details: DetailsBlock | null;
  after: string;
}

const DETAILS_RE = /<details>([\s\S]*?)<\/details>/;
const SUMMARY_RE = /<summary>([\s\S]*?)<\/summary>/;

/** Strips the 4-space indent Markdown's "indented code block" convention adds inside the <details>. */
function dedent(text: string): string {
  return text
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => line.replace(/^ {4}/, ""))
    .join("\n");
}

/** Pulls the sole `<details>…</details>` raw-HTML block (if any) out of a payload body. */
function splitOnDetails(text: string): Segments {
  const match = DETAILS_RE.exec(text);
  if (!match) return { before: text, details: null, after: "" };
  const [whole, inner] = match;
  const summaryMatch = SUMMARY_RE.exec(inner);
  const summary = summaryMatch ? summaryMatch[1] : "";
  const code = dedent(summaryMatch ? inner.slice(summaryMatch.index + summaryMatch[0].length) : inner);
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + whole.length);
  return { before, details: { summary, code }, after };
}

/** The one inline tag the corpus's <summary> text carries: `terminal output at head <code>9c2d4b1</code>`. */
function renderSummaryText(summary: string) {
  const parts = summary.split(/<code>([\s\S]*?)<\/code>/);
  return parts.map((part, i) =>
    // Odd indices are the captured <code>…</code> contents.
    i % 2 === 1 ? (
      <code key={i} className="rounded-[6px] bg-[#818b981f] px-[0.4em] py-[0.1em] font-mono text-[85%]">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

/** Flattens a react-markdown child tree to its plain text, to tell an empty `<th>` (the review-summary
 *  table's `| | |` header) from one with real header text (the Proof table's `SHA` / `result`). */
function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement(node)) return textContent((node.props as { children?: ReactNode }).children);
  return "";
}

const components: Components = {
  h1: (p) => <h1 className="mb-2 mt-0 text-[20px] font-semibold text-[#1f2328]" {...p} />,
  h2: (p) => <h2 className="mb-2 mt-0 text-[18px] font-semibold text-[#1f2328]" {...p} />,
  h3: (p) => <h3 className="mb-2 mt-0 text-[16px] font-semibold text-[#1f2328]" {...p} />,
  p: (p) => <p className="m-0 mb-3 text-[14px] leading-[1.6] text-[#1f2328] last:mb-0" {...p} />,
  strong: (p) => <strong className="font-semibold text-[#1f2328]" {...p} />,
  em: (p) => <em {...p} />,
  a: ({ href, ...rest }) => <a href={href} className="text-[#0969da] no-underline hover:underline" target="_blank" rel="noopener noreferrer" {...rest} />,
  ul: (p) => <ul className="m-0 mb-3 list-disc pl-5 text-[14px] text-[#1f2328]" {...p} />,
  ol: (p) => <ol className="m-0 mb-3 list-decimal pl-5 text-[14px] text-[#1f2328]" {...p} />,
  li: (p) => <li className="mb-1" {...p} />,
  blockquote: (p) => <blockquote className="m-0 mb-3 border-l-[3px] border-[#d0d7de] pl-3 text-[#59636e]" {...p} />,
  code: (p) => <code className="whitespace-pre-wrap rounded-[6px] bg-[#818b981f] px-[0.4em] py-[0.1em] font-mono text-[85%] text-[#1f2328]" {...p} />,
  hr: (p) => <hr className="my-4 border-0 border-t border-[#d0d7de]" {...p} />,
  // Mobile: GitHub's own table collapses to stacked label/value rows (brand-gaps
  // §E "Mobile"). display: table → block top to bottom (table/tbody/tr/cell) so
  // each <tr> becomes a flex row (first cell = label, second = value) and the
  // rows stack vertically, rather than a 2-column grid squeezed into 375px.
  table: (p) => <table className="mb-3 w-full border-collapse text-[13px] max-sm:block max-sm:border-none" {...p} />,
  // The review-summary table's header cells are empty (`| | |`, no header text to show at any
  // width — sr-only unconditionally). The Proof table's header cells carry real text (`SHA`,
  // `result`) and GitHub renders those visibly at desktop widths, so only the mobile,
  // stacked-rows layout (brand-gaps §E "Mobile") hides them here.
  thead: (p) => <thead className={textContent(p.children).trim() ? "max-sm:sr-only" : "sr-only"} {...p} />,
  tbody: (p) => <tbody className="max-sm:block" {...p} />,
  tr: (p) => <tr className="border-b border-[#d0d7de] max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:border-0 max-sm:border-b max-sm:py-2 max-sm:last:border-b-0" {...p} />,
  th: (p) => <th className="border border-[#d0d7de] px-3 py-2 text-left font-semibold text-[#1f2328] max-sm:border-0 max-sm:p-0" {...p} />,
  td: (p) => <td className="border border-[#d0d7de] px-3 py-2 text-left align-top text-[#1f2328] max-sm:border-0 max-sm:p-0" {...p} />,
};

/** One review_payload markdown body (a comment or the summary), rendered in GitHub's own light chrome. */
export function GithubMarkdown({ text }: { text: string }) {
  const { before, details, after } = splitOnDetails(text);
  return (
    <div className="gh-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {before}
      </ReactMarkdown>
      {details ? (
        <details className="mb-3 overflow-hidden rounded-[6px] border border-[#d0d7de]">
          <summary className="cursor-pointer select-none bg-[#f6f8fa] px-3 py-2 text-[13px] text-[#59636e]">{renderSummaryText(details.summary)}</summary>
          <pre className="m-0 overflow-x-auto border-t border-[#d0d7de] bg-[#f6f8fa] px-3 py-3 font-mono text-[12px] leading-[1.45] text-[#1f2328]">{details.code}</pre>
        </details>
      ) : null}
      {after ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {after}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}
