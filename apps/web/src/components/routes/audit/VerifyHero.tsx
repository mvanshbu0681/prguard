"use client";
// The page's one photographic moment: the chain's status, re-computed in this
// browser, on the landing's sky. Left: the seal and the numbers. Right, on a white
// glass tile: the head of the chain as linked blocks (the landing's "A record
// nobody can edit" visual, live), the walk's progress while it runs, or — in the
// tamper demo — exactly where it broke: the edit, the recorded hash, the
// recomputed one with the first differing nibble marked.
import { Check, CircleAlert, PencilLine, RotateCw, ShieldCheck, ShieldX, Undo2 } from "lucide-react";
import { Button, GlassTile, PhotoCard, Tag } from "@/components/dash/kit";
import { firstDifferingNibble } from "@/lib/audit-verify";
import { cn } from "@/lib/utils";
import { shortHash } from "@/components/routes/suppressions/format";
import { typeLabel, type AuditEvent } from "./audit-model";
import type { ServerVerdict, VerifyState } from "./use-chain-verification";
import s from "./audit.module.css";

function Nibbled({ hash, against, bad }: { hash: string; against: string; bad?: boolean }) {
  const at = firstDifferingNibble(hash, against);
  const head = hash.slice(0, 20);
  if (at === null || at >= 20) return <>{head}…</>;
  return (
    <>
      {head.slice(0, at)}
      <mark className={cn(s.nibble, bad && s.nibbleBad)}>{head[at]}</mark>
      {head.slice(at + 1)}…
    </>
  );
}

function MiniChain({ blocks, brokenSeq, walking }: { blocks: AuditEvent[]; brokenSeq: number | null; walking: boolean }) {
  // `data-focus` tells a narrow tile which two of the three blocks to keep: the
  // newest two at the head of the chain, or the break and the block before it.
  return (
    <div className={s.mini} data-walking={walking ? "" : undefined} data-focus={brokenSeq === null ? "head" : "break"} data-count={blocks.length}>
      {blocks.map((e, i) => (
        <span key={e.seq} className={s.miniItem}>
          {i > 0 ? <i className={cn(s.miniConnector, brokenSeq === e.seq && s.miniConnectorBroken)} aria-hidden /> : null}
          <span className={cn(s.miniBlock, brokenSeq === e.seq && s.miniBlockBroken, i === blocks.length - 1 && brokenSeq === null && s.miniBlockHead)}>
            <span className={s.miniSeq}>#{e.seq.toLocaleString("en-US")}</span>
            <span className={s.miniHash}>
              {e.event_hash.slice(0, 6)}…{e.event_hash.slice(-2)}
            </span>
            <span className={s.miniType}>{typeLabel(e.event_type)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

export interface VerifyHeroProps {
  state: VerifyState;
  server: ServerVerdict | null;
  /** The loaded chain, ascending. */
  chain: AuditEvent[];
  loading: boolean;
  canTamper: boolean;
  onVerify: () => void;
  onTamper: () => void;
  onRestore: () => void;
  onShowSeq: (seq: number) => void;
}

export function VerifyHero({ state, server, chain, loading, canTamper, onVerify, onTamper, onRestore, onShowSeq }: VerifyHeroProps) {
  const head = chain.at(-1) ?? null;
  const total = chain.length;
  const first = chain[0]?.seq ?? server?.firstSeq ?? null;
  const last = head?.seq ?? server?.lastSeq ?? null;
  const walking = state.phase === "walking";
  const broken = state.phase === "broken";
  const tampering = broken && state.tamper !== null;

  // The three blocks the tile shows: the head of the chain, or the break and its neighbours.
  const focusSeq = broken ? state.brokenAtSeq : null;
  const at = focusSeq !== null ? chain.findIndex((e) => e.seq === focusSeq) : -1;
  const blocks = at >= 0 ? chain.slice(Math.max(0, at - 1), Math.max(0, at - 1) + 3) : chain.slice(-3);

  const eyebrow = broken ? "Chain status · tamper demo" : "Chain status";
  let seal: "ok" | "bad" | "warn" | "busy" = "ok";
  let headline = "Chain verified";
  if (loading || state.phase === "idle") {
    seal = "busy";
    headline = "Reading the chain";
  } else if (walking) {
    seal = "busy";
    headline = state.tampering ? "Re-checking every link" : "Walking the chain";
  } else if (broken) {
    seal = "bad";
    headline = `Broken at #${state.brokenAtSeq.toLocaleString("en-US")}`;
  } else if (state.phase === "mismatch") {
    seal = "warn";
    headline = server?.verified ? "Verified by the server" : "Verification unavailable";
  } else if (state.phase === "unavailable") {
    seal = server?.verified === false ? "bad" : "warn";
    headline = server?.verified === false ? `Broken at #${server.brokenAtSeq ?? "—"}` : "Verified by the server";
  }

  const progress = walking ? state.done / Math.max(1, state.total) : 1;

  return (
    <PhotoCard
      as="section"
      aria-label="Audit chain verification"
      priority
      position="50% 18%"
      sizes="(max-width: 900px) 100vw, 80vw"
      className={cn(s.hero, broken && s.heroBroken)}
      data-chain={broken ? "broken" : seal === "ok" ? "verified" : "pending"}
    >
      <div className={s.heroGrid}>
        <div className={s.heroStatus}>
          <p className={s.heroEyebrow}>
            <span aria-hidden />
            {eyebrow}
          </p>
          <div className={s.sealRow}>
            <span className={cn(s.seal, s[`seal_${seal}`])} aria-hidden>
              {seal === "ok" ? (
                <ShieldCheck size={30} strokeWidth={2} />
              ) : seal === "bad" ? (
                <ShieldX size={30} strokeWidth={2} />
              ) : seal === "warn" ? (
                <CircleAlert size={28} strokeWidth={2} />
              ) : (
                <svg viewBox="0 0 40 40" className={s.sealRing}>
                  <circle cx="20" cy="20" r="17" className={s.sealTrack} />
                  <circle cx="20" cy="20" r="17" className={s.sealArc} style={{ strokeDasharray: `${progress * 106.8} 106.8` }} />
                </svg>
              )}
            </span>
            <h2 className={s.headline} aria-live="polite">
              {headline}
            </h2>
          </div>

          <p className={s.heroFacts}>
            {walking ? (
              <>
                <b>{state.done.toLocaleString("en-US")}</b> of {state.total.toLocaleString("en-US")} links re-computed
              </>
            ) : broken ? (
              state.tamper ? (
                <>
                  One edited event no longer matches its recorded hash. Everything after it is unverifiable until it&rsquo;s restored.
                </>
              ) : (
                <>The served chain does not re-compute at #{state.brokenAtSeq.toLocaleString("en-US")}.</>
              )
            ) : state.phase === "verified" ? (
              <>
                <b>{state.checked.toLocaleString("en-US")}</b> events · seq {first?.toLocaleString("en-US")} → {last?.toLocaleString("en-US")} · re-computed in your browser in{" "}
                {state.ms < 1000 ? `${Math.max(1, Math.round(state.ms))}\u00a0ms` : `${(state.ms / 1000).toFixed(1)}\u00a0s`}
              </>
            ) : state.phase === "mismatch" ? (
              <>Your browser could not reproduce the backend&rsquo;s hashes (a serialiser mismatch), so it shows the server&rsquo;s verdict instead of claiming a break.</>
            ) : state.phase === "unavailable" ? (
              state.reason === "no-crypto" ? (
                <>Hash checks need https or localhost; showing the server&rsquo;s verdict for {(server?.checked ?? total).toLocaleString("en-US")} events.</>
              ) : (
                <>These events carry no tenant id, so the browser cannot re-hash them; showing the server&rsquo;s verdict.</>
              )
            ) : (
              <>{total ? `${total.toLocaleString("en-US")} events loaded` : "Loading events"}</>
            )}
          </p>

          {head ? (
            <p className={s.headChip} title={head.event_hash}>
              <span>Head</span>
              <code>{shortHash(head.event_hash)}</code>
            </p>
          ) : null}

          <div className={s.heroActions}>
            {tampering ? (
              <Button variant="primary" chip={Undo2} chipStill onClick={onRestore}>
                Restore the record
              </Button>
            ) : (
              <Button variant="primary" chip={RotateCw} chipStill onClick={onVerify} disabled={walking || loading || state.phase === "unavailable"}>
                Verify again
              </Button>
            )}
            {tampering ? (
              <Button variant="glass" onClick={() => onShowSeq(state.brokenAtSeq)}>
                Show #{state.brokenAtSeq.toLocaleString("en-US")}
              </Button>
            ) : canTamper ? (
              <Button variant="glass" icon={PencilLine} onClick={onTamper} disabled={walking || loading || state.phase !== "verified"}>
                See what tampering looks like
              </Button>
            ) : null}
          </div>
        </div>

        <GlassTile tone="white" className={s.heroTile}>
          {broken ? (
            <div className={s.breakPanel}>
              <p className={s.tileLabel}>
                <span className={s.tileDotBad} aria-hidden />#{state.brokenAtSeq.toLocaleString("en-US")} · {typeLabel(chain.find((e) => e.seq === state.brokenAtSeq)?.event_type ?? "")}
              </p>
              {state.tamper ? (
                <p className={s.edit}>
                  <code className={s.editField}>{state.tamper.field}</code>
                  <span className={s.editFrom}>{state.tamper.from}</span>
                  <span aria-hidden>→</span>
                  <span className={s.editTo}>{state.tamper.to}</span>
                </p>
              ) : null}
              <dl className={s.diff}>
                <dt>Recorded</dt>
                <dd>
                  <Nibbled hash={state.expected} against={state.computed} />
                </dd>
                <dt>Recomputed</dt>
                <dd className={s.diffBad}>
                  <Nibbled hash={state.computed} against={state.expected} bad />
                </dd>
              </dl>
              <MiniChain blocks={blocks} brokenSeq={state.brokenAtSeq} walking={false} />
              {state.tamper ? (
                <p className={s.breakWhy}>
                  #{(state.brokenAtSeq + 1).toLocaleString("en-US")} still points at {state.expected.slice(0, 8)}. Hiding this edit means forging every event after it.
                </p>
              ) : null}
            </div>
          ) : (
            <div className={s.tileChain}>
              <p className={s.tileLabel}>
                <span className={s.tileDot} aria-hidden />
                {walking ? `Checking #${state.seq.toLocaleString("en-US")}` : "Head of the chain"}
              </p>
              <MiniChain blocks={blocks} brokenSeq={null} walking={walking} />
              <div className={s.walk} aria-hidden>
                <i style={{ transform: `scaleX(${progress})` }} />
              </div>
              <div className={s.tileFoot}>
                <span className={s.formulaSmall}>sha256(prev_hash ‖ canonical_json)</span>
                {state.phase === "verified" ? (
                  <Tag tone="lime" size="sm" icon={Check}>
                    Chain verified
                  </Tag>
                ) : walking ? (
                  <Tag tone="soft" size="sm">
                    {Math.round(progress * 100)}%
                  </Tag>
                ) : null}
              </div>
            </div>
          )}
        </GlassTile>
      </div>
    </PhotoCard>
  );
}
