// Finding.title, split on backtick-delimited spans so `create_session` renders
// as inline code. Not markdown: a title is one line of plain text with the
// occasional identifier in backticks.
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import s from "./title.module.css";

/** Splits `"a \`b\` c"` into ["a ", "b" (code), " c"], preserving backtick pairs only. */
export function splitTitleSegments(title: string): { text: string; code: boolean }[] {
  const parts = title.split(/(`[^`]+`)/g).filter((part) => part.length > 0);
  return parts.map((part) => (part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? { text: part.slice(1, -1), code: true } : { text: part, code: false }));
}

export function TitleWithCode({ title, codeClassName }: { title: string; codeClassName?: string }) {
  return (
    <>
      {splitTitleSegments(title).map((segment, i) => (
        <Fragment key={i}>{segment.code ? <code className={cn(s.code, codeClassName)}>{segment.text}</code> : segment.text}</Fragment>
      ))}
    </>
  );
}
