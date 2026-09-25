// OWNER: T1b (wave 1). A small CSS reader for asserting src/styles/ui.css.
// It understands comments, strings, nested blocks (native nesting, @media,
// @layer, @utility, @keyframes) and declarations — enough for our own file,
// without pulling a CSS parser into the dependency tree.
import fs from "node:fs";
import path from "node:path";

export interface CssDecl {
  prop: string;
  value: string;
}

export interface CssBlock {
  /** The text before `{`: a selector, or an at-rule such as "@media (hover: hover)". */
  prelude: string;
  decls: CssDecl[];
  children: CssBlock[];
  parent: CssBlock | null;
}

export const WEB_ROOT = path.resolve(import.meta.dirname, "../../..");

export function readWebFile(relative: string): string {
  return fs.readFileSync(path.join(WEB_ROOT, relative), "utf8");
}

/** The source with every comment replaced by a space (strings are kept intact). */
export function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Parse CSS into a tree of blocks. Declarations are split on top-level semicolons. */
export function parseCss(source: string): CssBlock {
  const css = stripComments(source);
  const root: CssBlock = { prelude: ":root-of-file", decls: [], children: [], parent: null };
  let current = root;
  let buffer = "";
  let depthParen = 0;
  let quote: string | null = null;

  const flushDecl = () => {
    const text = buffer.trim();
    buffer = "";
    if (!text) return;
    const colon = text.indexOf(":");
    if (colon === -1) {
      // a bare at-statement like `@apply type-label` without a colon
      current.decls.push({ prop: text, value: "" });
      return;
    }
    current.decls.push({ prop: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() });
  };

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      buffer += ch;
      if (ch === "\\") {
        buffer += css[++i] ?? "";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === "(") depthParen++;
    if (ch === ")") depthParen--;
    if (depthParen > 0) {
      buffer += ch;
      continue;
    }
    if (ch === "{") {
      const block: CssBlock = { prelude: buffer.trim().replace(/\s+/g, " "), decls: [], children: [], parent: current };
      buffer = "";
      current.children.push(block);
      current = block;
      continue;
    }
    if (ch === "}") {
      flushDecl();
      if (!current.parent) throw new Error("unbalanced } in CSS");
      current = current.parent;
      continue;
    }
    if (ch === ";") {
      flushDecl();
      continue;
    }
    buffer += ch;
  }
  if (current !== root) throw new Error("unclosed { in CSS");
  flushDecl();
  return root;
}

/** Every block in document order. */
export function allBlocks(root: CssBlock): CssBlock[] {
  const out: CssBlock[] = [];
  const walk = (b: CssBlock) => {
    for (const c of b.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

/** The chain of preludes from the file root down to (and including) this block. */
export function ancestry(block: CssBlock): string[] {
  const chain: string[] = [];
  for (let b: CssBlock | null = block; b && b.parent; b = b.parent) chain.unshift(b.prelude);
  return chain;
}

/** Blocks whose prelude is exactly this selector (whitespace-normalised). */
export function findBlocks(root: CssBlock, prelude: string): CssBlock[] {
  const want = prelude.replace(/\s+/g, " ").trim();
  return allBlocks(root).filter((b) => b.prelude === want);
}

/** The value of `prop` in the first block with this exact prelude. */
export function declValue(root: CssBlock, prelude: string, prop: string): string | undefined {
  for (const block of findBlocks(root, prelude)) {
    const decl = [...block.decls].reverse().find((d) => d.prop === prop);
    if (decl) return decl.value;
  }
  return undefined;
}
