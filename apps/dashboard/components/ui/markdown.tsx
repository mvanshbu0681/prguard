import clsx from "clsx";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ node: _n, className, ...p }) => (
    <h3 className={clsx("mb-2 mt-6 text-lg font-semibold tracking-[-0.01em] text-primary first:mt-0", className)} {...p} />
  ),
  h2: ({ node: _n, className, ...p }) => (
    <h4 className={clsx("mb-2 mt-6 text-base font-semibold text-primary first:mt-0", className)} {...p} />
  ),
  h3: ({ node: _n, className, ...p }) => (
    <h5 className={clsx("mb-1.5 mt-5 text-[0.95em] font-semibold text-primary first:mt-0", className)} {...p} />
  ),
  h4: ({ node: _n, className, ...p }) => (
    <h6 className={clsx("mb-1.5 mt-4 font-semibold text-body first:mt-0", className)} {...p} />
  ),
  p: ({ node: _n, className, ...p }) => <p className={clsx("my-2.5 first:mt-0 last:mb-0", className)} {...p} />,
  a: ({ node: _n, className, href, ...p }) => (
    <a
      href={href}
      target={href?.startsWith("#") ? undefined : "_blank"}
      rel="noreferrer"
      className={clsx("text-accent-text underline decoration-accent/30 underline-offset-2 hover:decoration-accent", className)}
      {...p}
    />
  ),
  strong: ({ node: _n, className, ...p }) => <strong className={clsx("font-semibold text-primary", className)} {...p} />,
  em: ({ node: _n, className, ...p }) => <em className={clsx("italic", className)} {...p} />,
  ul: ({ node: _n, className, ...p }) => (
    <ul className={clsx("my-2.5 list-disc space-y-1 pl-5 marker:text-faint first:mt-0 last:mb-0", className)} {...p} />
  ),
  ol: ({ node: _n, className, ...p }) => (
    <ol className={clsx("my-2.5 list-decimal space-y-1 pl-5 marker:text-faint first:mt-0 last:mb-0", className)} {...p} />
  ),
  li: ({ node: _n, className, ...p }) => <li className={clsx("pl-1", className)} {...p} />,
  blockquote: ({ node: _n, className, ...p }) => (
    <blockquote className={clsx("my-3 border-l-2 border-line-2 pl-3 text-dim", className)} {...p} />
  ),
  hr: ({ node: _n, className, ...p }) => <hr className={clsx("my-5 border-line", className)} {...p} />,
  code: ({ node: _n, className, ...p }) => (
    <code
      className={clsx("rounded-[4px] bg-surface-3 px-[0.35em] py-px font-mono text-[0.86em] text-primary", className)}
      {...p}
    />
  ),
  pre: ({ node: _n, className, ...p }) => (
    <pre
      className={clsx(
        "my-3 overflow-x-auto rounded-md border border-line bg-surface-0 px-3.5 py-3 font-mono text-xs leading-5 text-body",
        "[&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em] [&>code]:text-body",
        className,
      )}
      {...p}
    />
  ),
  table: ({ node: _n, className, ...p }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-line">
      <table className={clsx("w-full border-collapse text-sm", className)} {...p} />
    </div>
  ),
  thead: ({ node: _n, className, ...p }) => <thead className={clsx("bg-surface-2", className)} {...p} />,
  th: ({ node: _n, className, ...p }) => (
    <th className={clsx("border-b border-line px-3 py-2 text-left text-xs font-medium text-dim", className)} {...p} />
  ),
  td: ({ node: _n, className, ...p }) => (
    <td className={clsx("border-b border-hair px-3 py-2 align-top [tr:last-child_&]:border-0", className)} {...p} />
  ),
  input: ({ node: _n, className, ...p }) => (
    <input className={clsx("mr-1.5 translate-y-px accent-accent", className)} disabled {...p} />
  ),
  img: () => null,
};

export function Markdown({
  children,
  size = "base",
  className,
}: {
  children: string;
  size?: "base" | "sm";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "min-w-0 break-words text-body",
        size === "sm" ? "text-sm leading-[21px]" : "text-base leading-6",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
