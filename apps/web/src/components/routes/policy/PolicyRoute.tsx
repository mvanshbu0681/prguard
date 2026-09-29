"use client";
// /settings/policy — the rules Witness plays by. There is no settings endpoint
// (plan §13 A3): the live values are apps/api config.py's defaults, except the
// severity weights, which are read off a real finding's own severity.weights.
// Every control edits a local DRAFT; the gate impact is recomputed from the
// published findings with the backend's own rule (policy-model.ts), so moving
// a threshold shows what it would do before anyone sets an env var. Saving
// keeps the draft in this session and hands over the exact .env lines;
// nothing is written to the deployment, and the page says so.
import {
  ArrowRight,
  Bug,
  ChevronRight,
  Copy,
  EyeOff,
  FlaskConical,
  Gauge,
  Layers,
  RotateCcw,
  Scale,
  Send,
  ShieldCheck,
  ShieldHalf,
  TestTubeDiagonal,
  TriangleAlert,
  Workflow,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, Card, Eyebrow, Page, PageHeader, Rise, Skeleton, Switch, Tag, bandColor } from "@/components/dash/kit";
import { DEMO_IDS } from "@/lib/demo-ids";
import { SEVERITY_BANDS as BAND_ORDER, SEVERITY_INPUTS, type SeverityBand, type SeverityInput } from "@/lib/contracts";
import { auditHref, findingsHref, useFinding, useFindings } from "@/lib/hooks";
import type { Finding } from "@/lib/api-types";
import { BandPicker, BandScale, Locked, OptionCards, SettingRow, Stepper, WeightSlider, type CardOption } from "./controls";
import {
  bandUnder,
  changedKeys,
  diff,
  envLines,
  formatWeight,
  gateImpact,
  livePolicy,
  readStoredDraft,
  scoreUnder,
  writeStoredDraft,
  validate,
  weightSum,
  type DeliveryModeSetting,
  type Policy,
  type PolicyKey,
  type Thresholds,
} from "./policy-model";
import s from "./policy.module.css";

const cap = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

const INPUTS: Record<SeverityInput, { label: string; hint: string }> = {
  path_sensitivity: { label: "Path sensitivity", hint: "Touches auth, payments, crypto, migrations or PII" },
  reachability: { label: "Reachability", hint: "Reachable from a public entry point" },
  blast_radius: { label: "Blast radius", hint: "Callers the change reaches, saturating at 10" },
  coverage_gap: { label: "Coverage gap", hint: "Changed code that no test covers" },
  proof_confidence: { label: "Proof confidence", hint: "1 proven, 0.5 unknown, 0 refuted" },
  churn: { label: "Churn", hint: "Commits to the file in 90 days, saturating at 20" },
};

const DELIVERY: CardOption<DeliveryModeSetting>[] = [
  { value: "auto", title: "Auto", body: "Post to GitHub when a token is configured. Without one, dry-run.", icon: Workflow, meta: "The default" },
  { value: "post", title: "Post", body: "Always post the review and the merge gate.", icon: Send },
  { value: "dry_run", title: "Dry run", body: "Compute everything, post nothing. The dashboard still shows it all.", icon: EyeOff },
];

const SPECIALISTS: { key: string; name: string; body: string; icon: LucideIcon; tiers: string[] }[] = [
  { key: "bugs", name: "Bugs", body: "Defects the change introduces: removed guards, None handling, off-by-ones, contracts callers missed.", icon: Bug, tiers: ["trivial", "standard", "full"] },
  { key: "security", name: "Security", body: "Only exploitable chains, from untrusted input to the sink it reaches.", icon: ShieldHalf, tiers: ["trivial", "standard", "full"] },
  { key: "tests", name: "Tests", body: "Test integrity: assertions deleted, skipped or weakened to turn CI green.", icon: TestTubeDiagonal, tiers: ["standard", "full"] },
  { key: "quality", name: "Quality", body: "Maintenance debt that will cost someone real time. Its default answer is nothing.", icon: Wrench, tiers: ["full"] },
];

const TIERS = [
  { key: "trivial", name: "Trivial", rule: "Up to 10 changed lines." },
  { key: "standard", name: "Standard", rule: "Up to 200 changed lines." },
  { key: "full", name: "Full", rule: "Anything larger, or any path under auth, payments, crypto, migrations or PII." },
];

const GATE_KEYS: PolicyKey[] = ["BLOCK_MIN_SEVERITY", "SEVERITY_WEIGHTS", "SEVERITY_BANDS"];

function Section({ icon: Glyph, title, body, meta, id, children }: { icon: LucideIcon; title: string; body: ReactNode; meta?: ReactNode; id: string; children: ReactNode }) {
  return (
    <Card as="section" tone="surface" pad="lg" className={s.section} aria-labelledby={id}>
      <div className={s.intro}>
        <span className={s.introIcon} aria-hidden>
          <Glyph size={18} strokeWidth={1.8} />
        </span>
        <h2 className={s.introTitle} id={id}>
          {title}
        </h2>
        <p className={s.introBody}>{body}</p>
        {meta ? <div className={s.introMeta}>{meta}</div> : null}
      </div>
      <div className={s.panel}>{children}</div>
    </Card>
  );
}

function RulePill({ children, tone, color, icon: Glyph }: { children: ReactNode; tone: "proven" | "band" | "plain"; color?: string; icon?: LucideIcon }) {
  return (
    <span className={tone === "proven" ? `${s.pill} ${s.pillProven}` : tone === "band" ? `${s.pill} ${s.pillBand}` : `${s.pill} ${s.pillPlain}`} style={color ? { ["--c" as string]: color } : undefined}>
      {Glyph ? <Glyph strokeWidth={2.2} aria-hidden /> : tone === "band" ? <span className={s.pillDot} aria-hidden /> : null}
      {children}
    </span>
  );
}

function Ladder({ steps }: { steps: string[] }) {
  return (
    <ol className={s.ladder}>
      {steps.map((step, i) => (
        <li key={step} data-first={i === 0 ? "" : undefined}>
          {i ? <ChevronRight size={14} aria-hidden /> : null}
          {step}
        </li>
      ))}
    </ol>
  );
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function thresholdsOf(t: Thresholds, key: keyof Thresholds, v: number): Thresholds {
  return { ...t, [key]: v };
}

export function PolicyRoute() {
  const finding = useFinding(DEMO_IDS.proven_finding_id);
  const published = useFindings({ status: "published", limit: 200 });
  const findingWeights = finding.data?.severity?.weights ?? null;
  const live = useMemo(() => livePolicy(findingWeights), [findingWeights]);

  const [saved, setSaved] = useState<Partial<Policy>>({});
  const [pending, setPending] = useState<Partial<Policy>>({});
  const [restored, setRestored] = useState(false);

  // The draft survives a reload and a trip to another page (sessionStorage,
  // this tab only). Read after mount so the server render and the first
  // client render agree.
  useEffect(() => {
    const stored = readStoredDraft(typeof window === "undefined" ? null : safeSession());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore from browser storage after hydration
    setSaved(stored.saved);
    setPending(stored.pending);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) writeStoredDraft(safeSession(), { saved, pending });
  }, [restored, saved, pending]);
  const committed = useMemo<Policy>(() => ({ ...live, ...saved }), [live, saved]);
  const draft = useMemo<Policy>(() => ({ ...committed, ...pending }), [committed, pending]);
  const unsaved = changedKeys(committed, draft);
  const fromLive = changedKeys(live, draft);
  const savedKeys = changedKeys(live, committed);
  const issues = validate(draft);
  const set = <K extends PolicyKey>(k: K, v: Policy[K]) => setPending((p) => ({ ...p, [k]: v }));
  const isChanged = (k: PolicyKey) => fromLive.includes(k);

  // Leaving with unsaved edits asks first (the edits themselves are also kept).
  const hasUnsaved = unsaved.length > 0;
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  const items: Finding[] = useMemo(() => published.data?.items ?? [], [published.data]);
  const liveImpact = useMemo(() => gateImpact(items, live), [items, live]);
  const draftImpact = useMemo(() => gateImpact(items, draft), [items, draft]);
  const gateMoved = fromLive.some((k) => GATE_KEYS.includes(k));

  const blocksFrom = draft.BLOCK_MIN_SEVERITY;
  const blockingBands = BAND_ORDER.filter((b) => BAND_ORDER.indexOf(b) >= BAND_ORDER.indexOf(blocksFrom));
  const commentBands = BAND_ORDER.filter((b) => BAND_ORDER.indexOf(b) < BAND_ORDER.indexOf(blocksFrom));
  const sum = weightSum(draft.SEVERITY_WEIGHTS);
  const sumOk = Math.abs(sum - 1) < 1e-6;

  const copyEnv = async (keys: PolicyKey[]) => {
    const text = envLines(draft, keys.length ? keys : fromLive).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("ENV LINES COPIED", { description: `${keys.length || fromLive.length} ${keys.length === 1 ? "line" : "lines"} for the API's environment. Restart it to apply.` });
    } catch {
      toast.error("COPY BLOCKED", { description: text });
    }
  };

  const save = () => {
    if (issues.length) return;
    const next = diff(live, draft);
    setSaved(next);
    setPending({});
    const keys = changedKeys(live, draft);
    toast.success("POLICY DRAFT SAVED", {
      description: keys.length
        ? "Kept in this tab, even across a reload. Not applied: the deployment reads policy from its environment."
        : "Back to the live values.",
      action: keys.length ? { label: "Copy .env", onClick: () => void copyEnv(keys) } : undefined,
    });
  };

  const rebalance = () => {
    const w = draft.SEVERITY_WEIGHTS;
    const total = weightSum(w);
    if (total <= 0) return;
    const scaled = Object.fromEntries(SEVERITY_INPUTS.map((k) => [k, Math.round((w[k] / total) * 100) / 100])) as Policy["SEVERITY_WEIGHTS"];
    // Put the rounding remainder on the largest weight so the sum is exactly 1.00.
    const drift = Math.round((1 - weightSum(scaled)) * 100) / 100;
    const top = [...SEVERITY_INPUTS].sort((a, b) => scaled[b] - scaled[a])[0];
    scaled[top] = Math.round((scaled[top] + drift) * 100) / 100;
    set("SEVERITY_WEIGHTS", scaled);
  };

  const demo = finding.data?.severity ? finding.data : null;
  const demoLive = demo?.severity ? scoreUnder(demo.severity.inputs as Record<string, number>, live.SEVERITY_WEIGHTS) : null;
  const demoDraft = demo?.severity ? scoreUnder(demo.severity.inputs as Record<string, number>, draft.SEVERITY_WEIGHTS) : null;
  const t = draft.SEVERITY_BANDS;

  return (
    <Page className={s.root}>
      <PageHeader
        eyebrow="Policy"
        title="The rules Witness plays by."
        soft="Proof first, then severity."
        description="What decides whether a finding blocks a merge. Change anything to see what it would do to your gate; nothing reaches the deployment until it is in the environment."
        actions={
          savedKeys.length ? (
            <div className={s.headTags}>
              <Tag tone="warn" dot>
                Draft saved · not applied
              </Tag>
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  setSaved({});
                  setPending({});
                }}
              >
                Reset to live
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* The gate rule, as a sentence */}
      <Rise delay={40}>
        <Card tone="surface" pad="lg" className={s.hero} as="section" aria-labelledby="pol-rule">
          <div>
            <Eyebrow>The gate rule</Eyebrow>
            <p className={s.rule} id="pol-rule">
              A finding blocks a merge only when it is{" "}
              <RulePill tone="proven" icon={FlaskConical}>
                proven
              </RulePill>{" "}
              by execution, scores{" "}
              <RulePill tone="band" color={bandColor(blocksFrom)}>
                {blocksFrom}
              </RulePill>
              {blocksFrom === "critical" ? "," : " or above,"} is in <RulePill tone="plain">Python</RulePill> and was{" "}
              <span className="whitespace-nowrap">
                <RulePill tone="plain">published</RulePill>.
              </span>{" "}
              <span className={s.soft}>Everything else is a comment.</span>
            </p>
            <p className={s.ruleCode}>{`blocking = proof_status: proven AND severity band >= ${blocksFrom} AND language: python AND status: published`}</p>
          </div>
          <div className={s.impact} aria-live="polite">
            <p className={s.impactLabel}>Blocking today</p>
            {published.isPending ? (
              <Skeleton className="mt-2 h-[56px] w-[140px]" />
            ) : published.isError ? (
              <p className={s.impactHint}>The findings list didn&apos;t load, so the impact can&apos;t be computed.</p>
            ) : (
              <>
                <p className={s.impactValue}>
                  {liveImpact.findings}
                  <small>{liveImpact.findings === 1 ? "finding" : "findings"}</small>
                </p>
                <p className={s.impactHint}>
                  on {liveImpact.runs} {liveImpact.runs === 1 ? "run" : "runs"}, of {items.length} published. Recomputed here from each finding&apos;s own inputs.
                </p>
                <ul className={s.bands} aria-label="Blocking findings by band">
                  {[...BAND_ORDER].reverse().map((b) => {
                    const now = liveImpact.byBand[b];
                    const next = draftImpact.byBand[b];
                    const max = Math.max(1, ...BAND_ORDER.map((x) => Math.max(liveImpact.byBand[x], draftImpact.byBand[x])));
                    const shown = gateMoved ? next : now;
                    if (!now && !next) return null;
                    return (
                      <li key={b} className={s.bandRow}>
                        <span className={s.bandName}>{b}</span>
                        <span className={s.bandTrack} aria-hidden>
                          <i style={{ width: `${(shown / max) * 100}%`, background: bandColor(b) }} />
                        </span>
                        <b>{gateMoved && next !== now ? `${now} → ${next}` : shown}</b>
                      </li>
                    );
                  })}
                </ul>
                {gateMoved ? (
                  <div className={s.impactDraft}>
                    <span>Draft</span>
                    <ArrowRight size={14} strokeWidth={2} aria-hidden />
                    <b>{draftImpact.findings}</b>
                    <span>on {draftImpact.runs} runs</span>
                    <span className={s.impactDelta} data-dir={draftImpact.findings > liveImpact.findings ? "up" : draftImpact.findings < liveImpact.findings ? "down" : undefined}>
                      {draftImpact.findings === liveImpact.findings
                        ? "no change"
                        : `${draftImpact.findings > liveImpact.findings ? "+" : "−"}${Math.abs(draftImpact.findings - liveImpact.findings)} vs today`}
                    </span>
                  </div>
                ) : null}
                <div className={s.impactFoot}>
                  <Button variant="outline" size="sm" href={findingsHref("/findings", { blocking: true })} chip>
                    See them
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </Rise>

      {/* 1 — merge gate */}
      <Rise delay={100}>
        <Section
          id="pol-gate"
          icon={ShieldCheck}
          title="Merge gate"
          body="Where a proven finding stops being a comment and starts holding the merge. Proof itself is not negotiable."
        >
          <SettingRow
            wide
            label="Block merges from"
            hint="Proven findings at or above this band turn the gate red."
            envKey="BLOCK_MIN_SEVERITY"
            changed={isChanged("BLOCK_MIN_SEVERITY")}
          >
            <BandPicker value={draft.BLOCK_MIN_SEVERITY} onChange={(b: SeverityBand) => set("BLOCK_MIN_SEVERITY", b)} />
            <p className={s.consequence}>
              <span>
                Blocks: <b>{blockingBands.join(", ")}</b>
              </span>
              {commentBands.length ? (
                <span>
                  Comments only: <b>{commentBands.join(", ")}</b>
                </span>
              ) : null}
            </p>
          </SettingRow>
          <SettingRow label="Require proof to block" hint="An unproven finding can comment. It can never hold a merge, whatever its score.">
            <span className={s.lockedSwitch}>
              <Locked>Always on</Locked>
              <Switch checked disabled onChange={() => {}} label="Require proof to block (always on)" />
            </span>
          </SettingRow>
          <SettingRow label="Blocking languages" hint="Only Python has a sandboxed proof runner today, so only Python can block.">
            <Locked>Python only</Locked>
          </SettingRow>
          <SettingRow label="Break-glass" hint="A proven finding can still be suppressed with a written reason. Each one is an override.break_glass event in the audit log.">
            <Button variant="outline" size="sm" href={auditHref("/audit", { event_type: "override.break_glass" })}>
              Audit log
            </Button>
          </SettingRow>
          <SettingRow label="Review event" hint="Witness posts one GitHub review, as COMMENT. It never approves and never requests changes.">
            <Locked>Enforced in code</Locked>
          </SettingRow>
        </Section>
      </Rise>

      {/* 2 — severity model */}
      <Rise delay={160}>
        <Section
          id="pol-severity"
          icon={Scale}
          title="Severity model"
          body="Six measured inputs, weighted, summed to a score from 0 to 1. No model output is in the sum, so two identical findings always get the same band."
        >
          {finding.isPending ? (
            <div className="flex flex-col gap-3 p-[22px]" data-loading-state="" aria-busy="true" aria-label="Loading the live severity weights">
              {SEVERITY_INPUTS.map((k) => (
                <Skeleton key={k} className="h-[22px]" />
              ))}
            </div>
          ) : (
            <div className={s.weights}>
              <div className={s.wHead}>
                <p className={s.wHeadText}>
                  <b>Weights</b> · SEVERITY_WEIGHTS
                  {isChanged("SEVERITY_WEIGHTS") ? " · changed" : ""}
                </p>
                <span className={s.wSum}>
                  {!sumOk ? (
                    <Button variant="ghost" size="sm" icon={Gauge} onClick={rebalance}>
                      Rebalance
                    </Button>
                  ) : null}
                  <Tag tone={sumOk ? "ok" : "danger"} size="lg" title="The weights must sum to exactly 1.00">
                    Σ = {sum.toFixed(2)}
                  </Tag>
                </span>
              </div>
              {finding.isError ? (
                <SettingRow label="Live weights unavailable" hint="The demo finding didn't load, so these are config.py's defaults, not the weights in force." />
              ) : null}
              {SEVERITY_INPUTS.map((k) => (
                <div key={k} className={s.wRow}>
                  <div className={s.rowText}>
                    <p className={s.rowLabel}>
                      {draft.SEVERITY_WEIGHTS[k] !== live.SEVERITY_WEIGHTS[k] ? <span className={s.changed} aria-label="changed" /> : null}
                      {INPUTS[k].label}
                    </p>
                    <p className={s.rowHint}>{INPUTS[k].hint}</p>
                  </div>
                  <WeightSlider
                    value={draft.SEVERITY_WEIGHTS[k]}
                    label={`${INPUTS[k].label} weight`}
                    onChange={(v) => set("SEVERITY_WEIGHTS", { ...draft.SEVERITY_WEIGHTS, [k]: v })}
                  />
                  <span className={s.wValue}>{formatWeight(draft.SEVERITY_WEIGHTS[k])}</span>
                </div>
              ))}
              {demo?.severity && demoLive != null && demoDraft != null ? (
                <SettingRow wide label="What it does to a real finding" className="!border-t !border-w-line">
                  <div className={s.example}>
                    <p className={s.exampleTitle}>
                      <code>{demo.id.slice(0, 8)}</code>
                      {demo.title}
                    </p>
                    <span className={s.exampleScores}>
                      {Math.abs(demoDraft - demoLive) > 1e-9 ? <s>{demoLive.toFixed(3)}</s> : null}
                      {demoDraft.toFixed(3)}
                      <span className={s.exampleBand}>
                        <i style={{ background: bandColor(bandUnder(demoDraft, t)) }} aria-hidden />
                        {bandUnder(demoDraft, t)}
                      </span>
                    </span>
                    <div className={s.exampleTrack} aria-hidden>
                      <div className={s.exampleBands}>
                        {(
                          [
                            ["info", 0, t.low],
                            ["low", t.low, t.medium],
                            ["medium", t.medium, t.high],
                            ["high", t.high, t.critical],
                            ["critical", t.critical, 1],
                          ] as const
                        ).map(([b, from, to]) => (
                          <span key={b} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%`, ["--c" as string]: bandColor(b) }} />
                        ))}
                      </div>
                      {Math.abs(demoDraft - demoLive) > 1e-9 ? <span className={`${s.marker} ${s.markerLive}`} style={{ left: `${demoLive * 100}%` }} /> : null}
                      <span className={`${s.marker} ${s.markerDraft}`} style={{ left: `${demoDraft * 100}%` }} />
                    </div>
                    <p className={s.exampleSource}>{`Weights read from GET /v1/findings/${demo.id} → severity.weights`}</p>
                  </div>
                </SettingRow>
              ) : null}
            </div>
          )}
          <SettingRow
            wide
            label="Band thresholds"
            hint="Each band starts at its threshold. A refuted finding is clamped to info whatever it scores."
            envKey="SEVERITY_BANDS"
            changed={isChanged("SEVERITY_BANDS")}
            className="!border-t !border-w-line"
          >
            <BandScale
              thresholds={t}
              thumbs={(["low", "medium", "high", "critical"] as const).map((k, i, all) => ({
                id: k,
                value: t[k],
                label: `${cap(k)} starts at`,
                min: i === 0 ? 0.01 : t[all[i - 1]] + 0.01,
                max: i === all.length - 1 ? 1 : t[all[i + 1]] - 0.01,
                onChange: (v: number) => set("SEVERITY_BANDS", thresholdsOf(t, k, v)),
              }))}
            />
          </SettingRow>
        </Section>
      </Rise>

      {/* 3 — proof */}
      <Rise delay={220}>
        <Section
          id="pol-proof"
          icon={FlaskConical}
          title="Proof"
          body="Witness writes a repro test and runs it at base and at head in a sandbox. Only correctness, security and test-integrity findings in Python qualify. Each proof costs one model call and two runs, so the budget is small on purpose."
        >
          <SettingRow
            wide
            label="Attempt a proof from"
            hint="Findings scoring at least this are eligible, highest first, until the budget runs out."
            envKey="PROOF_MIN_SCORE"
            changed={isChanged("PROOF_MIN_SCORE")}
          >
            <BandScale
              thresholds={t}
              highlightFrom={draft.PROOF_MIN_SCORE}
              thumbs={[
                {
                  id: "min",
                  value: draft.PROOF_MIN_SCORE,
                  label: "Minimum score to attempt a proof",
                  step: 0.05,
                  onChange: (v: number) => set("PROOF_MIN_SCORE", v),
                  text: `≥ ${draft.PROOF_MIN_SCORE.toFixed(2)}`,
                },
              ]}
            />
            <p className={s.consequence}>
              <span>
                Eligible from <b>{bandUnder(draft.PROOF_MIN_SCORE, t)}</b>
                {bandUnder(draft.PROOF_MIN_SCORE, t) === "critical" ? "" : " up"}.
              </span>
            </p>
          </SettingRow>
          <SettingRow label="Proofs per run" hint="The top findings by score get one each." envKey="PROOF_MAX_PER_RUN" changed={isChanged("PROOF_MAX_PER_RUN")}>
            <Stepper label="Proofs per run" value={draft.PROOF_MAX_PER_RUN} min={0} max={10} onChange={(v) => set("PROOF_MAX_PER_RUN", v)} />
          </SettingRow>
          <SettingRow label="Proof timeout" hint="Per run of the repro test, at base or at head." envKey="PROOF_TIMEOUT" changed={isChanged("PROOF_TIMEOUT")}>
            <Stepper label="Proof timeout" value={draft.PROOF_TIMEOUT} min={10} max={600} step={10} unit="s" onChange={(v) => set("PROOF_TIMEOUT", v)} />
          </SettingRow>
          <SettingRow label="Dependency install" hint="Time allowed to install the repo's dependencies in the sandbox." envKey="DEP_INSTALL_TIMEOUT" changed={isChanged("DEP_INSTALL_TIMEOUT")}>
            <Stepper label="Dependency install timeout" value={draft.DEP_INSTALL_TIMEOUT} min={30} max={900} step={30} unit="s" onChange={(v) => set("DEP_INSTALL_TIMEOUT", v)} />
          </SettingRow>
          <SettingRow
            label="Require a baseline run"
            hint={
              draft.PROOF_REQUIRE_BASELINE
                ? "The test must pass at base and fail at head, so a proof shows this PR caused the bug."
                : "Off: only the head run counts. Proofs get twice as fast and stop showing that this PR caused the failure."
            }
            envKey="PROOF_REQUIRE_BASELINE"
            changed={isChanged("PROOF_REQUIRE_BASELINE")}
          >
            <Switch checked={draft.PROOF_REQUIRE_BASELINE} onChange={(v) => set("PROOF_REQUIRE_BASELINE", v)} label="Require a baseline run" />
          </SettingRow>
          <SettingRow label="Sandbox" hint="Docker with no network, 1 CPU and 1 GB. Without Docker it falls back to a subprocess and marks the proof isolation=degraded.">
            <Locked />
          </SettingRow>
        </Section>
      </Rise>

      {/* 4 — delivery */}
      <Rise delay={260}>
        <Section id="pol-delivery" icon={Send} title="Delivery" body="How the review reaches GitHub. Each rung falls back to the next rather than failing the run.">
          <SettingRow wide label="Posting" envKey="GITHUB_DELIVERY_MODE" changed={isChanged("GITHUB_DELIVERY_MODE")}>
            <OptionCards label="Delivery mode" options={DELIVERY} value={draft.GITHUB_DELIVERY_MODE} onChange={(v) => set("GITHUB_DELIVERY_MODE", v)} />
          </SettingRow>
          <SettingRow
            label="Review draft pull requests"
            hint={draft.REVIEW_DRAFT_PRS ? "Drafts are reviewed like any other pull request." : "Off: drafts are ignored until they are marked ready for review."}
            envKey="REVIEW_DRAFT_PRS"
            changed={isChanged("REVIEW_DRAFT_PRS")}
          >
            <Switch checked={draft.REVIEW_DRAFT_PRS} onChange={(v) => set("REVIEW_DRAFT_PRS", v)} label="Review draft pull requests" />
          </SettingRow>
          <SettingRow wide label="Comment placement" hint="Where each finding lands, best rung first.">
            <Ladder steps={["Inline, on the exact line", "Nearest line, within 10", "File-level", "Summary only"]} />
          </SettingRow>
          <SettingRow wide label="Merge gate" hint="How the verdict is published.">
            <Ladder steps={["Check run", "Commit status", "Dry run"]} />
          </SettingRow>
        </Section>
      </Rise>

      {/* 5 — specialists */}
      <Rise delay={300}>
        <Section
          id="pol-specialists"
          icon={Layers}
          title="Specialists"
          body="Four reviewers in parallel, one coordinator whose job is to delete. How many run is set by the size and sensitivity of the change."
          meta={<Locked>Set in code, not in the environment</Locked>}
        >
          <div className={s.specs}>
            {SPECIALISTS.map((sp) => (
              <article key={sp.key} className={s.spec}>
                <span className={s.specIcon} aria-hidden>
                  <sp.icon size={17} strokeWidth={1.8} />
                </span>
                <h3 className={s.specName}>{sp.name}</h3>
                <p className={s.specBody}>{sp.body}</p>
                <div className={s.specTiers}>
                  <span className={s.tierRail} aria-hidden>
                    {TIERS.map((tier) => (
                      <i key={tier.key} data-on={sp.tiers.includes(tier.key) ? "" : undefined} />
                    ))}
                  </span>
                  <span className={s.tierText}>
                    {sp.tiers.length === TIERS.length ? "Every review" : sp.tiers.length === 1 ? `${cap(sp.tiers[0])} only` : `${cap(sp.tiers[0])} and up`}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <div className={s.tiers}>
            {TIERS.map((tier) => (
              <div key={tier.key} className={s.tier}>
                <span className={s.tierName}>
                  {tier.name} · {SPECIALISTS.filter((sp) => sp.tiers.includes(tier.key)).length} reviewers
                </span>
                <span className={s.tierRule}>{tier.rule}</span>
              </div>
            ))}
          </div>
        </Section>
      </Rise>

      <p className={s.foot}>
        Preview only. This deployment reads its policy from the environment; saving keeps a draft here and gives you the .env lines to apply it.
      </p>

      {unsaved.length ? (
        <div className={s.dockWrap}>
          <div className={s.dock} role="region" aria-label="Unsaved policy changes">
            <div className={s.dockText} aria-live="polite">
              <span className={s.dockCount}>
                <i aria-hidden />
                {unsaved.length} unsaved {unsaved.length === 1 ? "change" : "changes"}
              </span>
              {issues.length ? (
                <span className={`${s.dockNote} ${s.dockIssue}`}>
                  <TriangleAlert size={11} strokeWidth={2.2} className="mr-1 inline" aria-hidden />
                  {issues[0].message}
                </span>
              ) : (
                <span className={s.dockNote}>Preview · not applied to the deployment</span>
              )}
            </div>
            <div className={s.dockActions}>
              <Button variant="ghost" size="sm" onClick={() => setPending({})}>
                Discard
              </Button>
              <Button variant="outline" size="sm" icon={Copy} onClick={() => void copyEnv(fromLive)} disabled={issues.length > 0}>
                .env
              </Button>
              <Button variant="primary" size="sm" chip onClick={save} disabled={issues.length > 0}>
                Save draft
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
