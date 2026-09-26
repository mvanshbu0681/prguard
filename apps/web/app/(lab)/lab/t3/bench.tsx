// OWNER: T3 (wave 1). The replay bench's markup: a stand-in set-piece for useReplay,
// not the product's <ProofBench> (track T4). No hooks, so it renders on the server:
// this markup IS the end frame (motion spec §0 rule 1). The replay (./replay-demo)
// only ever moves it away from here and back.
//
// Hooks for the timeline, all data attributes:
//   [data-scan]                    the scan line (.scan: collapsed at rest, travels on --ease-mass)
//   [data-pane] [data-group=1..3]  terminal row groups, lit in three steps
//   [data-rail=base|head]          2px left rails, wiped with scaleY
//   [data-underline]               the 1px rule under `1 failed`, drawn with scaleX
//   [data-verdict]                 the chip: data-state flips at 0ms, data-stamp restarts the stamp
//   [data-caption]                 `→ blocks merge`
import type { Ref } from "react";

export interface BenchIds {
  base: string;
  head: string;
  testPath: string;
  testName: string;
}

function Pane({ side, sha, ids }: { side: "base" | "head"; sha: string; ids: BenchIds }) {
  const passed = side === "base";
  return (
    <div data-pane={side} className="relative min-w-0 border-rule-1 first:border-b md:first:border-r md:first:border-b-0">
      <i
        data-rail={side}
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[2px] origin-top ${passed ? "bg-signal-lo" : "bg-alarm"}`}
      />
      <div className="flex items-baseline justify-between gap-3 border-b border-rule-1 py-2 pr-4 pl-5">
        <span className="type-label text-text-dim">{side}</span>
        <span className="type-data text-text-body">{sha}</span>
      </div>
      <div className="overflow-x-auto py-3 pr-4 pl-5">
        <pre className="type-terminal whitespace-pre text-text-body">
          <span data-group="1" className="block text-text-dim">
            $ pytest {ids.testPath} -q
          </span>
          <span data-group="2" className="block">
            {ids.testPath}::{ids.testName} <span className={passed ? "text-signal-text" : "text-alarm-text"}>{passed ? "PASSED" : "FAILED"}</span>
          </span>
          <span data-group="3" className="block">
            {passed ? (
              "1 passed"
            ) : (
              <span className="relative inline-block text-alarm-text">
                1 failed
                <i data-underline aria-hidden className="absolute inset-x-0 -bottom-px h-px origin-left bg-alarm" />
              </span>
            )}
          </span>
        </pre>
      </div>
    </div>
  );
}

export function Bench({ ids, ref }: { ids: BenchIds; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="relative overflow-hidden rounded-panel border border-rule-1 bg-ink-1 inset-shadow-hi">
      <i data-scan aria-hidden className="scan pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-signal-hi" />
      <div className="grid md:grid-cols-2">
        <Pane side="base" sha={ids.base} ids={ids} />
        <Pane side="head" sha={ids.head} ids={ids} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule-1 px-5 py-3">
        <span
          data-verdict
          data-state="proven"
          data-stamp="rest"
          className="group/chip stamp inline-flex h-5 min-w-[120px] items-center justify-center rounded-data border px-1.5 type-badge data-[state=not_attempted]:border-proof-not-attempted-border data-[state=not_attempted]:bg-proof-not-attempted-bg data-[state=not_attempted]:text-proof-not-attempted-fg data-[state=proven]:border-proof-proven-border data-[state=proven]:bg-proof-proven-bg data-[state=proven]:text-proof-proven-fg"
        >
          <span className="hidden group-data-[state=proven]/chip:inline">proven</span>
          <span className="group-data-[state=proven]/chip:hidden">not attempted</span>
        </span>
        <span data-caption className="type-small text-alarm-text">
          → blocks merge
        </span>
        <span className="type-data text-text-dim md:ml-auto">passes at base · fails at head</span>
      </div>
    </div>
  );
}
