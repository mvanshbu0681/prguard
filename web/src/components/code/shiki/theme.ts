// OWNER: t1d (wave 1). `prguard-cold`: the Shiki theme, built from the --syn-* tokens.
//
// Near-monochrome by design (design §1.12): six roles, no new hues. Never github-dark.
//   comment  --syn-comment   (the one deliberate sub-floor value; high contrast promotes it)
//   plain    --syn-plain     punctuation, variables, everything unclaimed
//   keyword  --syn-keyword   keywords, storage, operators, decorators, `self`
//   string   --syn-string
//   number   --syn-number    numbers and language constants (True, None, null)
//   entity   --syn-entity    function / class / type names, JSON · YAML · TOML keys, at weight 500
// plus two roles for the `diff` grammar only: inserted --diff-add-text, deleted --diff-del-text.
//
// How the tokens get in: TextMate themes only accept hex, so every role is a sentinel hex
// that the theme's own `colorReplacements` rewrites to var(--token) — the mechanism
// Shiki's css-variables theme uses. Nothing here duplicates a token value: a token change
// in app/tokens/core.css re-themes every code surface, and [data-contrast="high"] works.
// CodeBlock then maps each var(--syn-*) back to a role CLASS (code.css), so no token
// ever lands in an inline style.
import type { ThemeRegistration } from "shiki/core";

export const SYNTAX_ROLES = ["plain", "comment", "keyword", "string", "number", "entity", "inserted", "deleted"] as const;
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];

/** Sentinel colours (identifiers, never displayed) — one per role. Lowercase, as Shiki keys them. */
const SENTINEL: Readonly<Record<SyntaxRole, string>> = {
  plain: "#000001",
  comment: "#000002",
  keyword: "#000003",
  string: "#000004",
  number: "#000005",
  entity: "#000006",
  inserted: "#000007",
  deleted: "#000008",
};
const BACKGROUND_SENTINEL = "#000009";

/** The token each role resolves to. */
export const ROLE_TOKEN: Readonly<Record<SyntaxRole, string>> = {
  plain: "var(--syn-plain)",
  comment: "var(--syn-comment)",
  keyword: "var(--syn-keyword)",
  string: "var(--syn-string)",
  number: "var(--syn-number)",
  entity: "var(--syn-entity)",
  inserted: "var(--diff-add-text)",
  deleted: "var(--diff-del-text)",
};

const ROLE_BY_TOKEN: ReadonlyMap<string, SyntaxRole> = new Map(SYNTAX_ROLES.map((role) => [ROLE_TOKEN[role], role]));

/** A Shiki token colour (after replacement) → its role. Unknown or absent → plain. */
export function roleForColor(color: string | undefined): SyntaxRole {
  return (color && ROLE_BY_TOKEN.get(color)) || "plain";
}

/** Scope selectors per role. TextMate precedence (most specific selector wins) resolves overlaps,
 *  e.g. `meta.function-call.generic` (entity) versus the call's punctuation (plain). `plain`
 *  is the default; its entries only pull back scopes a broader rule would otherwise colour
 *  (shell arguments and flags are `string.unquoted.*`, which would paint a whole command amber). */
const SCOPES: Readonly<Record<SyntaxRole, readonly string[]>> = {
  plain: ["string.unquoted.argument.shell", "constant.other.option", "string.unquoted.shell", "punctuation.separator.statement"],
  comment: ["comment", "punctuation.definition.comment", "string.comment", "comment.line", "comment.block"],
  keyword: [
    "keyword",
    "keyword.control",
    "keyword.operator",
    "keyword.other",
    "storage",
    "storage.type",
    "storage.modifier",
    "variable.language",
    "variable.parameter.function.language.special",
    "support.type.primitive",
    "meta.decorator",
    "entity.name.function.decorator",
    "punctuation.definition.decorator",
    "entity.name.tag",
    "markup.underline.link",
    "punctuation.definition.list.begin.markdown",
    "punctuation.definition.block.sequence.item.yaml",
    "keyword.operator.logical.shell",
    "keyword.operator.pipe.shell",
    "meta.diff.range",
    "meta.diff.index",
  ],
  string: [
    "string",
    "string.quoted",
    "string.template",
    "string.regexp",
    "string.unquoted.plain.out.yaml",
    "string.unquoted.plain.in.yaml",
    "punctuation.definition.string",
    "markup.inline.raw",
  ],
  number: [
    "constant.numeric",
    "constant.language",
    "constant.character.escape",
    "constant.other.boolean",
    "support.constant",
    "constant.other.date",
    "constant.other.time",
    "constant.other.datetime",
  ],
  entity: [
    "entity.name.function",
    "entity.name.class",
    "entity.name.type",
    "entity.name.namespace",
    "entity.other.inherited-class",
    "support.function",
    "support.class",
    "meta.function-call.generic",
    "entity.name.command",
    "entity.name.section",
    "markup.heading",
    "support.type.property-name",
    "entity.name.tag.yaml",
    "support.type.property-name.toml",
    "entity.other.attribute-name.table.toml",
    "variable.other.key.toml",
    "meta.diff.header",
  ],
  inserted: ["markup.inserted", "punctuation.definition.inserted"],
  deleted: ["markup.deleted", "punctuation.definition.deleted"],
};

export const PRGUARD_COLD_THEME_NAME = "prguard-cold";

export const PRGUARD_COLD_THEME: ThemeRegistration = {
  name: PRGUARD_COLD_THEME_NAME,
  displayName: "PRGuard Cold",
  type: "dark",
  fg: SENTINEL.plain,
  bg: BACKGROUND_SENTINEL,
  colors: {
    "editor.foreground": SENTINEL.plain,
    "editor.background": BACKGROUND_SENTINEL,
  },
  settings: [
    { settings: { foreground: SENTINEL.plain, background: BACKGROUND_SENTINEL } },
    ...(Object.keys(SCOPES) as (keyof typeof SCOPES)[]).map((role) => ({
      name: role,
      scope: [...SCOPES[role]],
      settings: { foreground: SENTINEL[role], fontStyle: "" },
    })),
  ],
  colorReplacements: {
    ...Object.fromEntries(SYNTAX_ROLES.map((role) => [SENTINEL[role], ROLE_TOKEN[role]])),
    [BACKGROUND_SENTINEL]: "var(--ink-1)",
  },
};
