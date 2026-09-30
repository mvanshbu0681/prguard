import type { Flow } from "./summarize.ts";

const MAX_NODES = 8;

/** A label Mermaid always parses: no quotes, pipes, backticks or line breaks, kept short. */
function clean(label: string, max: number): string {
  const text = label
    .replace(/[`\r\n]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\|/g, "/")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * A left-to-right Mermaid flowchart from the summary's flow. Built from data, never from model text,
 * so it always renders. Null when fewer than two steps are connected.
 */
export function flowMermaid(flow: Flow | null | undefined): string | null {
  if (!flow) return null;
  const ids = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const node of flow.nodes) {
    if (ids.size >= MAX_NODES || ids.has(node.id)) continue;
    const label = clean(node.label, 40);
    if (!label) continue;
    ids.set(node.id, `n${ids.size + 1}`);
    labels.set(node.id, label);
  }
  const edges = flow.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  if (connected.size < 2) return null;

  const lines = ["flowchart LR"];
  for (const id of connected) lines.push(`  ${ids.get(id)}["${labels.get(id)}"]`);
  for (const e of edges) {
    const label = clean(e.label, 24);
    lines.push(`  ${ids.get(e.from)} -->${label ? `|${label}|` : ""} ${ids.get(e.to)}`);
  }
  return lines.join("\n");
}
