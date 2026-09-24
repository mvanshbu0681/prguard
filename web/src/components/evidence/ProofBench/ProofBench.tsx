"use client";
// OWNER: t4 (wave 2). <ProofBench> — the product's signature: a finding's repro test,
// executed at the base SHA and at the head SHA, shown as evidence (docs/design/03 §01 §7,
// docs/design/05 §4.6, docs/design/02 §5.7 §1.7, docs/design/04 §3b).
//
// It ships twice, as the same component: the landing hero (density="detail", mode="replay")
// and the dashboard finding detail (density="compact", mode="static" — §04 PROOF).
// src/components/evidence/** ships on both surfaces, so this file imports NO gsap and NO
// '@/motion/useReplay' (that would drag GSAP into the dashboard bundle); the replay is built
// entirely on useSequence + the CSS classes T3 shipped for exactly this (.scan, .stamp,
// .heartbeat in src/styles/motion.css) plus this component's own bench.module.css.
//
// Render contract: the STATIC frame (mode="static", or mode="replay" before/after an active
// run) is the complete end state — proven chip stamped, both panes lit, verdict rail read.
// A replay's every visual override lives behind `[data-pb-anim]` on the wrapper this file
// renders (bench.module.css); with that attribute absent the DOM is indistinguishable from
// the static render, which is both the frame-0 guarantee and the reduced-motion guarantee
// (tests/unit/evidence/proof-bench/replay-equals-static.test.tsx pins it).
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Exhibit } from "@/components/chrome";
import { ProofChip } from "@/components/badges";
import { PYTEST_TONES, TerminalBlock } from "@/components/code";
import { heartbeatProps } from "@/motion/heartbeat";
import { useSequence, type SequenceStep } from "@/motion/useSequence";
import { cn } from "@/lib/utils";
import styles from "./bench.module.css";
import {
  CONSEQUENCE_TEXT_CLASS,
  consequence,
  DETAIL_PANE_VISIBLE_LINES,
  failingPane,
  hasExecution,
  paneBackground,
  paneText,
  paneTone,
  railTone,
  runnerIsolation,
  sha7,
  tailLines,
  verdictLeft,
} from "./format";
import type { ProofBenchProps } from "./props";
import { BEATS, HOLD_MS, STAGE, type Stage } from "./timeline";

export type { ProofBenchProps };

function Seam({ headShort }: { headShort: string | null }) {
  return (
    <div className="flex items-center gap-3 border-y border-rule-1 bg-ink-1 px-4 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-rule-1" />
      <span className="type-label whitespace-nowrap text-text-dim">
        {headShort ? (
          <>
            {"— HEAD "}
            <span className="tracking-normal normal-case">{headShort}</span>
            {" —"}
          </>
        ) : (
          "— HEAD —"
        )}
      </span>
      <span className="h-px flex-1 bg-rule-1" />
    </div>
  );
}

export function ProofBench(props: ProofBenchProps) {
  const {
    proof,
    density,
    mode = "static",
    onReplayEnd,
    findingId,
    baseSha,
    headSha,
    blocking,
    claim,
    index = "01",
    provenance,
    capturedAt,
    ext,
    replayKey,
    autoplay = "none",
  } = props;

  // §04 the dashboard's compact pane never scans (dashboard-blueprint §3b: "In the
  // dashboard, none — the bench renders in its final state"; brief STRUCTURE item 6:
  // "density 'compact' … no scan line"). Only "detail" ever actually replays.
  const effectiveMode = density === "compact" ? "static" : mode;

  const [stage, setStage] = useState<Stage>(STAGE.rest);
  const [animating, setAnimating] = useState(false);
  const [runToken, setRunToken] = useState(0);

  const reset = useCallback(() => {
    setAnimating(true);
    setStage(STAGE.rest);
    setRunToken((t) => t + 1);
  }, []);
  const handleEnd = useCallback(() => {
    // Settle all the way back to stage 0 too, not just animating=false: with no reset the
    // data-pb-* flags would sit on the root forever at their final "true" values — inert
    // (nothing keys off them once [data-pb-anim] is gone) but no longer bit-for-bit the
    // pristine DOM a fresh static render produces. The replay-equals-static guarantee is
    // about the actual markup, not just the visible result.
    setAnimating(false);
    setStage(STAGE.rest);
    onReplayEnd?.();
  }, [onReplayEnd]);

  const steps = useMemo<SequenceStep[]>(
    () => BEATS.map((b) => ({ at: b.at, label: String(b.stage), apply: () => setStage(b.stage) })),
    [],
  );

  // Destructured immediately: `seq.ref` (an unstructured access) makes the React Compiler
  // lint treat the whole object as a ref (react-hooks/refs) and flags every `seq.x` read
  // (src/motion/useSequence.ts's own header comment says so).
  const { ref: benchRootRef } = useSequence<HTMLDivElement>(steps, {
    key: effectiveMode === "replay" ? replayKey : undefined,
    autoplay: effectiveMode === "replay" ? autoplay : "none",
    reset,
    hold: HOLD_MS,
    onEnd: handleEnd,
  });

  // The scan line travels the full height of the pane stack (motion §4.6.2): measured, not
  // guessed, so "detail" (fixed pane heights) and "compact" (auto height) both just work.
  const travelRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  useLayoutEffect(() => {
    const el = travelRef.current;
    if (!el) return;
    setTravel(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setTravel(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flags = {
    a0: stage >= STAGE.scanStart,
    a1: stage >= STAGE.paneA1,
    a2: stage >= STAGE.paneA2,
    railA: stage >= STAGE.railA,
    b0: stage >= STAGE.paneB0,
    b1: stage >= STAGE.paneB1,
    b2: stage >= STAGE.paneB2,
    railB: stage >= STAGE.railB,
    underline: stage >= STAGE.underline,
    stamped: stage >= STAGE.stamp,
    consequence: stage >= STAGE.consequence,
  };

  const base7 = sha7(baseSha);
  const head7 = sha7(headSha);
  const baseTone = paneTone(proof.base);
  const headTone = paneTone(proof.head);
  const fail = failingPane(proof);
  const execOk = hasExecution(proof);
  const meta = runnerIsolation(proof);
  const resolvedIdentifier = findingId ? `finding ${findingId.slice(0, 8)}` : undefined;
  const cons = consequence(proof.status, blocking);
  const verdictText = verdictLeft(proof);

  const scanAttr = animating && flags.a0 ? (runToken % 2 === 0 ? "a" : "b") : undefined;

  const metaNode = (
    <span className="inline-flex items-center gap-2">
      <span className="heartbeat" aria-hidden="true" {...heartbeatProps(0)} />
      {meta ? <span className="type-label whitespace-nowrap text-text-dim">{meta}</span> : null}
      <span className={cn("inline-flex", styles.chip, animating && flags.stamped && "stamp")}>
        <ProofChip status={proof.status} />
      </span>
    </span>
  );

  return (
    <div
      ref={benchRootRef}
      className={styles.root}
      data-pb-anim={animating || undefined}
      data-pb-a0={flags.a0 || undefined}
      data-pb-a1={flags.a1 || undefined}
      data-pb-a2={flags.a2 || undefined}
      data-pb-rail-a={flags.railA || undefined}
      data-pb-b0={flags.b0 || undefined}
      data-pb-b1={flags.b1 || undefined}
      data-pb-b2={flags.b2 || undefined}
      data-pb-rail-b={flags.railB || undefined}
      data-pb-underline={flags.underline || undefined}
      data-pb-stamped={flags.stamped || undefined}
      data-pb-consequence={flags.consequence || undefined}
    >
      <Exhibit
        index={index}
        category="Proof bench"
        identifier={resolvedIdentifier}
        provenance={provenance}
        capturedAt={capturedAt}
        ext={ext}
        density={density === "detail" ? "full" : "compact"}
        radius={density === "detail" ? "container" : "panel"}
        meta={metaNode}
      >
        {claim ? (
          <p
            className={cn(
              "border-b border-rule-1 px-4 py-2 type-body text-text-body",
              proof.status === "disproven" && "line-through decoration-1",
            )}
          >
            {claim}
          </p>
        ) : null}

        {execOk ? (
          <div ref={travelRef} className="relative">
            {effectiveMode === "replay" ? (
              <span aria-hidden="true" className={cn("scan", styles.scanLine)} data-scan={scanAttr} style={{ "--scan-travel": `${travel}px` } as React.CSSProperties} />
            ) : null}
            <div className={cn(styles.paneA, fail === "base" && styles.failPane)}>
              <TerminalBlock
                text={
                  density === "detail"
                    ? tailLines(paneText(base7, proof.command, proof.base), DETAIL_PANE_VISIBLE_LINES)
                    : paneText(base7, proof.command, proof.base)
                }
                label={base7 ? `base ${base7}` : "base"}
                highlight={PYTEST_TONES}
                rail={railTone(baseTone)}
                background={paneBackground(baseTone)}
                height={density === "detail" ? 210 : undefined}
                maxHeight={density === "compact" ? 320 : undefined}
              />
            </div>
            <Seam headShort={head7} />
            <div className={cn(styles.paneB, fail === "head" && styles.failPane)}>
              <TerminalBlock
                text={
                  density === "detail"
                    ? tailLines(paneText(head7, proof.command, proof.head), DETAIL_PANE_VISIBLE_LINES)
                    : paneText(head7, proof.command, proof.head)
                }
                label={head7 ? `head ${head7}` : "head"}
                highlight={PYTEST_TONES}
                rail={railTone(headTone)}
                background={paneBackground(headTone)}
                height={density === "detail" ? 210 : undefined}
                maxHeight={density === "compact" ? 320 : undefined}
              />
            </div>
          </div>
        ) : (
          <p className="px-4 py-6 type-body text-text-dim">PRGuard did not execute a repro test for this finding.</p>
        )}

        <div className="flex h-11 items-center justify-between gap-4 border-t border-rule-1 bg-ink-2 px-4">
          <span className={cn("type-label text-text-body", styles.verdictLeft)}>{verdictText}</span>
          <span className={cn("type-label", styles.verdictRight, CONSEQUENCE_TEXT_CLASS[cons.tone])}>{cons.text}</span>
        </div>
      </Exhibit>
    </div>
  );
}
