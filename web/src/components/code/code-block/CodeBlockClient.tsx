"use client";
// OWNER: t1d (wave 1). <CodeBlockClient>: the client fallback of <CodeBlock>.
//
// For code that only exists in the browser (a canonical_json row expanded in the chain
// rail, anything inside a Client Component). First paint is plain text in the identical
// DOM — same lines, same heights, no layout shift — then Shiki arrives through a dynamic
// import() and the colours fill in. The highlighter is its own lazy chunk: pages that
// never mount this component never download it.
import { useEffect, useState } from "react";
import { plainLines, type CodeLine } from "../shiki/tokens";
import { CodeFrame } from "./CodeFrame";
import { failedNote, resolveCodeBlock, type CodeBlockProps } from "./props";

type Result = { key: string; lines: CodeLine[] } | { key: string; failed: true };

export function CodeBlockClient(props: CodeBlockProps) {
  const { language, unavailable, label, title } = resolveCodeBlock(props);
  const { code } = props;
  const key = `${language ?? ""}\u0000${code}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!language) return;
    let alive = true;
    import("../shiki/highlighter")
      .then((m) => m.highlightCode(code, language))
      .then(
        (lines) => {
          if (alive) setResult({ key, lines });
        },
        () => {
          if (alive) setResult({ key, failed: true });
        },
      );
    return () => {
      alive = false;
    };
  }, [key, language, code]);

  const current = result && result.key === key ? result : null;
  const highlighted = current && "lines" in current ? current.lines : null;
  const failed = Boolean(current && "failed" in current);

  return (
    <CodeFrame
      lines={highlighted ?? plainLines(code)}
      label={label}
      title={title}
      language={language}
      unavailable={failed && language ? failedNote(language) : unavailable}
      startLine={props.startLine}
      lineNumbers={props.lineNumbers}
      highlight={props.highlight}
      actions={props.actions}
      header={props.header}
      height={props.height}
      maxHeight={props.maxHeight}
      state={highlighted ? "highlighted" : "plain"}
      id={props.id}
      className={props.className}
    />
  );
}
