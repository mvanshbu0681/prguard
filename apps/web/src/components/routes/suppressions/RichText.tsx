// Finding titles carry inline markdown code (`_line()`, `prune_seen()`). Render the
// backtick spans as mono code instead of printing the backticks — nothing else of
// markdown is interpreted, so a title can never inject markup.
import { Fragment } from "react";
import s from "./suppressions.module.css";

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split("`");
  // An odd count of backticks leaves the last span unclosed: print it literally.
  const balanced = parts.length % 2 === 1;
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const isCode = balanced && i % 2 === 1;
        if (!isCode) return <Fragment key={i}>{!balanced && i > 0 ? `\`${part}` : part}</Fragment>;
        return (
          <code key={i} className={s.inlineCode}>
            {part}
          </code>
        );
      })}
    </span>
  );
}
