// OWNER: t1d (wave 1). Props shared by <CodeBlock> (server) and <CodeBlockClient>.
import type { ReactNode } from "react";
import type { LineHighlight } from "../shared/types";
import { extensionOf, LANGUAGE_LABEL, resolveLanguage, type SupportedLanguage } from "../shiki/languages";

export interface CodeBlockProps {
  /** The source text. CRLF accepted; one trailing newline is not an extra line. */
  code: string;
  /** Language name or alias (FindingLocation.language). Falls back to `filePath`'s extension. */
  lang?: string | null;
  /** File path (FindingLocation.file_path): picks the language and titles the header. */
  filePath?: string | null;
  /** Header title. Defaults to `filePath`. */
  title?: ReactNode;
  /** Accessible name of the scroll region. Defaults to the file path, else "Source code". */
  label?: string;
  /** Number printed on the first line (the start offset). Default 1. */
  startLine?: number;
  /** 40px line-number gutter. Default true. */
  lineNumbers?: boolean;
  /** Highlighted finding lines: 2px rail in `tone` + an --ink-3 row. First match wins. */
  highlight?: readonly LineHighlight[];
  /** Right-aligned header slot (copy / download controls from the UI primitives). */
  actions?: ReactNode;
  /** Force the header on or off. */
  header?: boolean;
  height?: number;
  maxHeight?: number;
  id?: string;
  className?: string;
}

/** Plain text asked for on purpose: no "unavailable" note for these. */
const PLAIN_BY_REQUEST = new Set(["text", "plain", "plaintext", "txt", "log"]);

export interface ResolvedCodeBlock {
  language: SupportedLanguage | null;
  /** What highlighting is unavailable for (".ex", "elixir"), or null when nothing was asked. */
  unavailable: string | null;
  label: string;
  title: ReactNode;
}

export function resolveCodeBlock({ lang, filePath, title, label }: CodeBlockProps): ResolvedCodeBlock {
  const language = resolveLanguage(lang, filePath);
  const asked = lang?.trim().toLowerCase();
  const plainByRequest = asked ? PLAIN_BY_REQUEST.has(asked) : false;
  const unavailable = language || plainByRequest ? null : (extensionOf(filePath) ?? (asked || null));
  return {
    language,
    unavailable,
    label: label ?? filePath ?? "Source code",
    title: title ?? filePath ?? undefined,
  };
}

/** The note printed when a bundled language failed to tokenise (never expected; stated if it happens). */
export function failedNote(language: SupportedLanguage): string {
  return LANGUAGE_LABEL[language];
}
