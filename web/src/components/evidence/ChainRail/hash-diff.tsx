// OWNER: t6 (wave 2). The broken row's expected/computed hash diff, with the first
// differing nibble highlighted (dashboard-blueprint §3c: "Byte-level, not 'hashes
// differ'"). Kept separate from src/lib/audit-verify.ts's `firstDifferingNibble` (pure,
// no React) so that module stays importable from a Node test with zero JSX.
import type { ReactNode } from "react";
import { firstDifferingNibble } from "@/lib/audit-verify";

function markAt(hash: string, at: number | null): ReactNode {
  if (at === null || at >= hash.length) return hash;
  return (
    <>
      {hash.slice(0, at)}
      <mark className="rounded-[1px] bg-alarm-tint-hi text-alarm-hi" data-slot="chain-rail-nibble">
        {hash[at]}
      </mark>
      {hash.slice(at + 1)}
    </>
  );
}

export interface NibbleDiff {
  expectedNode: ReactNode;
  computedNode: ReactNode;
  at: number | null;
}

/** `expected` and `computed`, each with the first character they differ at wrapped in a
 *  `<mark>` on `--alarm-tint-hi`. */
export function firstDifferingNibbleView(expected: string, computed: string): NibbleDiff {
  const at = firstDifferingNibble(expected, computed);
  return { expectedNode: markAt(expected, at), computedNode: markAt(computed, at), at };
}
