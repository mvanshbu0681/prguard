"use client";
// Proof by execution — the hero of the page. What the pair of runs means in one
// sentence, the two runs side by side (base, then head, each with its SHA,
// verdict and pytest's own summary line), the repro test Witness wrote, the
// command, and the captured output in an ink terminal window.
//
// Every state is a first-class layout: proven, refuted (the passing evidence
// is the point), inconclusive (with the reason read off the two runs), and the
// three that never executed (not attempted, not applicable, no environment).
import { ArrowRight, Check, Copy, Minus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { CodeBlockClient, PYTEST_TONES, TerminalBlock } from "@/components/code";
import { Card, Eyebrow, IconButton, Segmented, Tag } from "@/components/dash/kit";
import { sha } from "@/components/dash/format";
import type { Finding, ReviewResult } from "@/lib/api-types";
import { formatDurationMs, proofVerdict, runOutcome, type RunOutcome } from "./format";
import s from "./detail.module.css";

const RUN_ICON = { passed: Check, failed: X, error: TriangleAlert, timeout: TriangleAlert, not_run: Minus } as const;

function RunTile({ at, commit, outcome }: { at: "base" | "head"; commit: string | null | undefined; outcome: RunOutcome }) {
  const Glyph = RUN_ICON[outcome.kind];
  return (
    <div className={s.run} data-kind={outcome.kind}>
      <div className={s.runTop}>
        <span className={s.runAt}>
          {at}
          {commit ? <span className={s.runSha}>{sha(commit)}</span> : null}
        </span>
        <span className={s.runIcon} aria-hidden>
          <Glyph size={15} strokeWidth={2.6} />
        </span>
      </div>
      <p className={s.runLabel}>{outcome.label}</p>
      <p className={s.runSummary} title={outcome.summary ?? undefined}>
        {outcome.summary ?? "no output captured"}
        {outcome.exitCode !== null ? ` · exit ${outcome.exitCode}` : ""}
      </p>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      icon={copied ? Check : Copy}
      label={copied ? "Copied" : label}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard unavailable: the text is still selectable.
        }
      }}
    />
  );
}

export function ProofCard({ finding, review }: { finding: Finding; review: ReviewResult | undefined }) {
  const proof = finding.proof;
  const verdict = proofVerdict(proof, { blocking: Boolean(finding.blocking), status: finding.status });
  const base = runOutcome(proof?.base);
  const head = runOutcome(proof?.head);
  const executed = base.kind !== "not_run" || head.kind !== "not_run";
  // Show the side that tells the story first: the failing head, else whichever ran.
  const [side, setSide] = useState<"head" | "base">(head.kind !== "not_run" || base.kind === "not_run" ? "head" : "base");
  const shown = side === "head" ? proof?.head : proof?.base;
  const shownOutcome = side === "head" ? head : base;
  const commit = side === "head" ? review?.pull_request.head_sha : review?.pull_request.base_sha;
  const duration = formatDurationMs(proof?.duration_ms && proof.duration_ms > 0 ? proof.duration_ms : null);

  const facts = [
    proof?.runner ? proof.runner : null,
    proof?.isolation ? proof.isolation : null,
    proof?.baseline_mode && proof.baseline_mode !== "not_applicable" ? `baseline ${proof.baseline_mode}` : null,
    duration,
    proof?.deps_install_ok === false ? "deps failed" : proof?.deps_install_ok ? "deps ok" : null,
  ].filter((f): f is string => Boolean(f));

  return (
    <Card as="section" tone="surface" pad="lg" className={s.proofCard} aria-labelledby="proof-title" data-proof={proof?.status ?? "none"}>
      <div className={s.proofHead}>
        <div className="min-w-0">
          <Eyebrow lime={verdict.tone === "proven"}>Proof by execution</Eyebrow>
          <h2 id="proof-title" className={s.proofTitle}>
            {verdict.title}
          </h2>
          <p className={s.proofBody}>{verdict.body}</p>
        </div>
        {facts.length ? (
          <div className={s.facts} aria-label="How it ran">
            {facts.map((f) => (
              <Tag key={f} tone="outline" size="sm">
                {f}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>

      {executed ? (
        <div className={s.runs} aria-label="Runs at base and head">
          <RunTile at="base" commit={review?.pull_request.base_sha} outcome={base} />
          <div className={s.runArrow} aria-hidden>
            <span>
              <ArrowRight size={14} strokeWidth={2} />
            </span>
          </div>
          <RunTile at="head" commit={review?.pull_request.head_sha} outcome={head} />
        </div>
      ) : null}

      {proof?.test_code ? (
        <div className={s.block}>
          <div className={s.blockHead}>
            <p className={s.label}>The repro test Witness wrote</p>
          </div>
          <div className={s.window}>
            <div className={s.windowBar}>
              <span className={s.windowTitle}>{proof.test_file_path ?? "repro test"}</span>
              <CopyButton text={proof.test_code} label="Copy the repro test" />
            </div>
            <div className={s.windowBody}>
              <CodeBlockClient code={proof.test_code} filePath={proof.test_file_path} lang={finding.location.language} label={proof.test_file_path ?? "Repro test"} header={false} maxHeight={440} />
            </div>
          </div>
          {proof.command ? (
            <div className={s.command}>
              <span aria-hidden>$</span>
              <code>{proof.command}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      {executed ? (
        <div className={s.block}>
          <div className={s.blockHead}>
            <p className={s.label}>Captured output</p>
            {base.kind !== "not_run" && head.kind !== "not_run" ? (
              <Segmented
                size="sm"
                label="Which run's output"
                value={side}
                onChange={setSide}
                options={[
                  { value: "head", label: `Head · ${head.label.toLowerCase()}` },
                  { value: "base", label: `Base · ${base.label.toLowerCase()}` },
                ]}
              />
            ) : null}
          </div>
          <div className={s.term}>
            <div className={s.termBar}>
              <span className={s.dots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className={s.termTitle}>
                {side} {commit ? sha(commit) : ""} · {proof?.test_file_path ?? "repro"}
              </span>
              <span className={s.termTag} data-kind={shownOutcome.kind}>
                {shownOutcome.label}
              </span>
            </div>
            <div className={s.termBody}>
              <TerminalBlock
                key={side}
                text={`${proof?.command ? `$ ${proof.command}\n` : ""}${(shown?.excerpt ?? "").replace(/^\n+/, "")}`}
                label={`Output at ${side}${commit ? ` ${sha(commit)}` : ""}`}
                highlight={PYTEST_TONES}
                maxHeight={380}
              />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
