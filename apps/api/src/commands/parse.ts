export type CommandName = "help" | "review" | "explain" | "fix" | "ignore" | "question";

export type Parsed = { command: CommandName; args: string };

const KNOWN = new Set<CommandName>(["help", "review", "explain", "fix", "ignore"]);

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text a person wrote: quoted replies and code blocks can mention PR Guard without meaning it. */
function ownText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");
}

/**
 * Inline code can mention PR Guard without meaning it too ("try `@prguard review`"). Its `@` is hidden
 * without moving anything, so the command's arguments still keep their code.
 */
function maskInlineCode(text: string): string {
  return text.replace(/(`+)[^`]+?\1/g, (span) => span.replace(/@/g, " "));
}

/**
 * The command in a comment that mentions PR Guard (`@prguard` or `@<app slug>`), or null. A bare
 * mention is `help`; a first word that is not a command makes the rest a question.
 */
export function parseMention(body: string, slug: string): Parsed | null {
  const re = new RegExp(`(^|[^\\w/@.-])@(?:prguard|${escape(slug)})(?![\\w-])([\\s\\S]*)$`, "i");
  const text = ownText(body);
  const m = re.exec(maskInlineCode(text));
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length - m[2]!.length).trim();
  if (!rest) return { command: "help", args: "" };
  const first = rest.split(/\s+/)[0]!;
  const word = first.toLowerCase().replace(/[^a-z]/g, "") as CommandName;
  if (KNOWN.has(word)) return { command: word, args: rest.slice(first.length).trim() };
  return { command: "question", args: rest };
}
