// OWNER: d3 (wave 3). Finding.title, split on backtick-delimited spans so
// `create_session` renders as inline code (dashboard-blueprint §2.7 header:
// "title (render backticks as inline code)"). Not markdown — a title is one
// line of plain text with the occasional identifier in backticks, so a full
// ReactMarkdown pass would be doing a lot of work to draw one <code> tag.
import { Fragment } from "react";

/** Splits `"a \`b\` c"` into ["a ", "b" (code), " c"], preserving backtick pairs only. */
export function splitTitleSegments(title: string): { text: string; code: boolean }[] {
  const parts = title.split(/(`[^`]+`)/g).filter((part) => part.length > 0);
  return parts.map((part) => (part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? { text: part.slice(1, -1), code: true } : { text: part, code: false }));
}

export function TitleWithCode({ title }: { title: string }) {
  return (
    <>
      {splitTitleSegments(title).map((segment, i) => (
        <Fragment key={i}>
          {segment.code ? <code className="rounded-[2px] bg-ink-2 px-[0.25em] py-[0.05em] font-mono text-[0.82em] text-text-primary">{segment.text}</code> : segment.text}
        </Fragment>
      ))}
    </>
  );
}
