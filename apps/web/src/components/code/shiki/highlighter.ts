// OWNER: t1d (wave 1). The Shiki highlighter: core API + JavaScript regex engine.
//
// No WASM (no oniguruma), no barrel import. Everything is loaded lazily:
//   - shiki/core and shiki/engine/javascript on first use,
//   - each grammar the first time a block in that language renders (languages.ts).
// On the server this module is used by the async <CodeBlock>, so the highlighter never
// ships to the client. <CodeBlockClient> reaches it only through a dynamic import().
// One highlighter per process (or per tab), created once and reused.
import type { HighlighterCore } from "shiki/core";
import { LANGUAGE_LOADERS, type SupportedLanguage } from "./languages";
import { WITNESS_COLD_THEME, WITNESS_COLD_THEME_NAME, roleForColor } from "./theme";
import { normaliseCode, type CodeLine, type CodeToken } from "./tokens";

/** Lines longer than this are not tokenised (a minified blob would stall the tokenizer);
 *  they render as plain text, still unwrapped. */
export const TOKENIZE_MAX_LINE_LENGTH = 4000;

let core: Promise<HighlighterCore> | undefined;
const grammars = new Map<SupportedLanguage, Promise<void>>();

async function createCore(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]);
  return createHighlighterCore({
    themes: [WITNESS_COLD_THEME],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
}

export function getHighlighter(): Promise<HighlighterCore> {
  core ??= createCore().catch((error: unknown) => {
    core = undefined; // let the next render retry instead of caching the failure
    throw error;
  });
  return core;
}

async function ensureGrammar(highlighter: HighlighterCore, lang: SupportedLanguage): Promise<void> {
  let pending = grammars.get(lang);
  if (!pending) {
    pending = highlighter.loadLanguage(LANGUAGE_LOADERS[lang]()).catch((error: unknown) => {
      grammars.delete(lang);
      throw error;
    });
    grammars.set(lang, pending);
  }
  return pending;
}

/** Tokenise `code` into role-tagged lines. Adjacent tokens of one role are merged. */
export async function highlightCode(code: string, lang: SupportedLanguage): Promise<CodeLine[]> {
  const highlighter = await getHighlighter();
  await ensureGrammar(highlighter, lang);
  const lines = highlighter.codeToTokensBase(normaliseCode(code), {
    lang,
    theme: WITNESS_COLD_THEME_NAME,
    tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
  });
  return lines.map((tokens) => {
    const out: CodeToken[] = [];
    for (const t of tokens) {
      if (!t.content) continue;
      // Whitespace carries no colour; folding it into the neighbour keeps the DOM small.
      const role = /^\s+$/.test(t.content) ? (out[out.length - 1]?.role ?? "plain") : roleForColor(t.color);
      const prev = out[out.length - 1];
      if (prev && prev.role === role) prev.text += t.content;
      else out.push({ text: t.content, role });
    }
    return out;
  });
}

/** Grammars loaded so far (Shiki's own names plus aliases). For tests and diagnostics. */
export async function loadedLanguages(): Promise<string[]> {
  return (await getHighlighter()).getLoadedLanguages();
}
