// OWNER: t1d (wave 1). <CodeBlock>: server-rendered, Shiki-highlighted source (design §5.6).
//
// An async Server Component: Shiki runs on the server, the page receives classed spans,
// and the highlighter never ships to the client. Inside a Client Component use
// <CodeBlockClient> (same props, same DOM), which renders plain text first and
// highlights after a lazy import.
//
// Language outside the ten bundled ones → plain mono at --text-body with the gutter and
// rails intact, and the header states `syntax highlighting unavailable for .ex`
// (dashboard §4: a degradation stated is not a failure).
import { highlightCode } from "../shiki/highlighter";
import { plainLines, type CodeLine } from "../shiki/tokens";
import { CodeFrame } from "./CodeFrame";
import { failedNote, resolveCodeBlock, type CodeBlockProps } from "./props";

export async function CodeBlock(props: CodeBlockProps) {
  const { language, unavailable, label, title } = resolveCodeBlock(props);
  let lines: CodeLine[] = plainLines(props.code);
  let state: "plain" | "highlighted" = "plain";
  let note = unavailable;
  if (language) {
    try {
      lines = await highlightCode(props.code, language);
      state = "highlighted";
    } catch {
      note = failedNote(language);
    }
  }
  return (
    <CodeFrame
      lines={lines}
      label={label}
      title={title}
      language={language}
      unavailable={note}
      startLine={props.startLine}
      lineNumbers={props.lineNumbers}
      highlight={props.highlight}
      actions={props.actions}
      header={props.header}
      height={props.height}
      maxHeight={props.maxHeight}
      state={state}
      id={props.id}
      className={props.className}
    />
  );
}
