// OWNER: t1d (wave 1). The code, terminal and diff surfaces. Styles: src/styles/code.css.
//
//   <TerminalBlock>    captured stdout/stderr (anser → classes). Server or client.
//   <CodeBlock>        Shiki-highlighted source. ASYNC SERVER COMPONENT.
//   <CodeBlockClient>  the same block inside a Client Component (lazy highlighter).
//   <PRGuardDiff>      the one diff component (own renderer; the decision is in its header).
//
// Importing this barrel from a Client Component is safe: Shiki is only ever reached
// through dynamic import(), so it lands in the client bundle only if <CodeBlockClient>
// actually mounts. Rendering <CodeBlock> inside a Client Component is an error (it is
// async); use <CodeBlockClient> there.
export { TerminalBlock, type TerminalBackground, type TerminalBlockProps } from "./terminal/TerminalBlock";
export {
  buildTerminalLines,
  splitIntoGroups,
  DEFAULT_PROMPT,
  type TerminalBuildOptions,
  type TerminalHighlightRule,
  type TerminalLine,
  type TerminalSegment,
} from "./terminal/model";
export { PYTEST_TONES } from "./terminal/presets";
export { parseAnsi, ANSI_FAMILIES, type AnsiFamily, type AnsiSpan } from "./terminal/ansi";

export { CodeBlock } from "./code-block/CodeBlock";
export { CodeBlockClient } from "./code-block/CodeBlockClient";
export type { CodeBlockProps } from "./code-block/props";
export { SUPPORTED_LANGUAGES, resolveLanguage, type SupportedLanguage } from "./shiki/languages";
export { SYNTAX_ROLES, type SyntaxRole } from "./shiki/theme";
export type { CodeLine, CodeToken } from "./shiki/tokens";

export {
  PRGuardDiff,
  lineOn,
  type DiffAnnotation,
  type DiffHighlight,
  type DiffSide,
  type PRGuardDiffProps,
} from "./diff/PRGuardDiff";
export { parseUnifiedDiff, pairRows, type DiffRow, type DiffRowKind, type ParsedDiff } from "./diff/parse";

export { RAIL_TONES, TEXT_TONES, type LineHighlight, type RailTone, type TextTone } from "./shared/types";
