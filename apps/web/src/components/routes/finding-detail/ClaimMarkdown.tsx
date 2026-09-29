"use client";
// Finding.body_markdown with the restricted schema: p, ul, ol, code, pre,
// strong, em, a, blockquote. `skipHtml` drops raw HTML outright; anything
// outside the schema (a heading, a table, an image) is unwrapped to its text
// rather than silently deleting a specialist's sentence.
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "ul", "ol", "li", "code", "pre", "strong", "em", "a", "blockquote"] as const;

const BODY = "text-[15.5px] leading-[1.7] text-w-text-2";

// `node` (react-markdown's mdast source node) is pulled out of every override's
// props so it never leaks onto a DOM element as an unknown attribute.
/* eslint-disable @typescript-eslint/no-unused-vars */
const COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => <p className={BODY} {...props} />,
  ul: ({ node: _node, ...props }) => <ul className={cn(BODY, "list-disc space-y-1 pl-5")} {...props} />,
  ol: ({ node: _node, ...props }) => <ol className={cn(BODY, "list-decimal space-y-1 pl-5")} {...props} />,
  li: ({ node: _node, ...props }) => <li {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-w-text" {...props} />,
  em: ({ node: _node, ...props }) => <em {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="border-l-2 border-w-line-heavy pl-4 text-w-muted" {...props} />,
  a: ({ node: _node, className, ...props }) => (
    <a className={cn("text-w-text underline decoration-w-line-heavy underline-offset-[3px] hover:decoration-current", className)} target="_blank" rel="noreferrer noopener" {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code className={cn("rounded-[6px] bg-w-surface px-[0.34em] py-[0.06em] font-w-mono text-[0.84em] text-w-text shadow-[inset_0_0_0_1px_var(--w-line)] [box-decoration-break:clone]", className)} {...props} />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre className={cn("overflow-x-auto rounded-w-inner bg-w-surface-3 p-4 font-w-mono text-[12.5px] leading-[1.6] [&_code]:bg-transparent [&_code]:p-0", className)} {...props} />
  ),
};
/* eslint-enable @typescript-eslint/no-unused-vars */

export interface ClaimMarkdownProps {
  /** Finding.body_markdown. */
  children: string;
  className?: string;
}

export function ClaimMarkdown({ children, className }: ClaimMarkdownProps) {
  return (
    <div className={cn("max-w-[72ch] space-y-3", className)} data-slot="claim-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} allowedElements={[...ALLOWED_ELEMENTS]} unwrapDisallowed skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
