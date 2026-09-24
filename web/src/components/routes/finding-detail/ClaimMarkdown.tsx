"use client";
// OWNER: d3 (wave 3). Finding.body_markdown, styled for the dark surface
// (dashboard-blueprint §2.7 §01 CLAIM): "restricted schema: p, ul, ol, code,
// pre, strong, em, a, blockquote. No raw HTML. Inline `code` gets Google Sans
// Code at 12.5px on --ink-2 with 2px radius."
//
// `skipHtml` drops raw HTML outright (never parsed as markup — printed as
// literal text would still be a channel for injected markup, so it is
// dropped); `allowedElements` + `unwrapDisallowed` keeps anything outside the
// restricted schema (a heading, a table, an image) as plain text content
// instead of silently deleting a specialist's sentence.
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "ul", "ol", "li", "code", "pre", "strong", "em", "a", "blockquote"] as const;

// `node` (react-markdown's mdast source node) must be pulled out of every override's
// props before the rest are spread onto a real DOM element — leaving it in would leak an
// unknown `node` attribute onto <p>, <a>, etc. Naming it to discard it is unused by design.
/* eslint-disable @typescript-eslint/no-unused-vars */
const COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => <p className="type-body text-text-body" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="type-body list-disc space-y-1 pl-5 text-text-body" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="type-body list-decimal space-y-1 pl-5 text-text-body" {...props} />,
  li: ({ node: _node, ...props }) => <li {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-text-primary" {...props} />,
  em: ({ node: _node, ...props }) => <em {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-2 border-rule-2 pl-4 text-text-dim" {...props} />,
  a: ({ node: _node, className, ...props }) => <a className={cn("link-prose", className)} target="_blank" rel="noreferrer noopener" {...props} />,
  code: ({ node: _node, className, ...props }) => <code className={cn("rounded-[2px] bg-ink-2 px-[0.3em] py-[0.05em] font-mono text-[12.5px] text-text-primary", className)} {...props} />,
  pre: ({ node: _node, className, ...props }) => <pre className={cn("overflow-x-auto rounded-panel border border-rule-1 bg-ink-1 p-3 font-mono text-[12.5px] leading-[1.5]", className)} {...props} />,
};
/* eslint-enable @typescript-eslint/no-unused-vars */

export interface ClaimMarkdownProps {
  /** Finding.body_markdown. */
  children: string;
  className?: string;
}

/** The finding's claim, rendered with the restricted schema (§2.7 §01 CLAIM). */
export function ClaimMarkdown({ children, className }: ClaimMarkdownProps) {
  return (
    <div className={cn("max-w-(--measure-body) space-y-3", className)} data-slot="claim-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} allowedElements={[...ALLOWED_ELEMENTS]} unwrapDisallowed skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
