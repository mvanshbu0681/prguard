"use client";
// OWNER: t6 (wave 2).
//
// <ChainRail> — the hash-chained audit trail, rendered so it reads as tamper-evident
// (dashboard-blueprint §3c; landing-blueprint §07 "THE FLIGHT RECORDER"; plan A8/A9;
// motion §4.8.2, §4.8.3). One of the five components plan §2 says must never be cut.
//
// The rail is a 1px hairline; each row carries seq, event_type, actor (glyph, never
// colour alone), a relative-time delta and its hash as first8…last4. Selecting a row
// reveals its canonical_json (contenteditable when `tamperable`), and — once
// `useChainWindow` (./use-chain-window.ts) has verified the untouched window in the
// browser — the expected/computed hash equality. Typing in that field is TAMPER BY
// TYPING (motion §4.8.3): a 120ms-debounced recompute of the RENDERED WINDOW ONLY
// (brand-gaps §2 ruling 14), and on a mismatch: the header snaps to `--alarm-text` on
// `--alarm-tint` at 0ms (plan §2 hard rule 3 — R2: `--alarm` is fill-only, never text),
// the rail opens a literal 6px gap at the broken seq, every row below desaturates, and
// the broken row's expected/computed hashes diff with the first differing nibble lit.
//
// THE FOUR GUARDS (brand-gaps §G), all in ./use-chain-window.ts:
//   1. no secure context / no crypto.subtle → read-only, "hash verification requires
//      https or localhost"
//   2. the untouched window fails to verify → "verification unavailable — serialiser
//      mismatch" in --marker, and the broken-chain UI never renders
//   3. a monotonic request id discards a stale async digest
//   4. only the rendered window is ever recomputed, never the whole chain
// Plus plan A9: items with no `tenant_id` (live mode today) show the server's verdict
// with "browser verification needs tenant_id in GET /v1/audit" and stay read-only.
//
// Ships on BOTH surfaces (src/components/evidence/**): no gsap, no '@/motion/useReplay'.
// Entrance animation is the engine-free CSS substrate (src/styles/motion.css) via
// `data-anim` + `.reveal` / `.draw` — the app-wide batched IntersectionObserver
// (src/motion/reveal.ts) reveals them; nothing here drives a timeline.
import { useCallback, useId, useMemo, useState, type ClipboardEvent, type FormEvent, type HTMLAttributes, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Exhibit, Surface } from "@/components/chrome";
import type { AuditEvent, ChainRailProps as BaseChainRailProps } from "@/components/evidence/props";
import { Check, Cross, Play, Restore } from "@/components/icons";
import { auditHashDocument, canonicalJson } from "@/lib/canonical-json";
import type { ActorType } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { useStamp } from "@/motion/stamp";
import { ActorGlyph } from "./actor-glyph";
import { formatAbsoluteUtc, formatRelativeDelta, hashShort } from "./format";
import { firstDifferingNibbleView } from "./hash-diff";
import { useChainWindow, type LosslessAuditEvent } from "./use-chain-window";

// ---------------------------------------------------------------------------
// Props — ChainRailProps (props.ts) is frozen; extended locally (see 'raised').
// ---------------------------------------------------------------------------

export type ChainRailSurface = "marketing" | "dashboard";

export interface ChainRailOwnProps {
  /**
   * RAISED (props.ts lacks a render-mode field — extended locally, not in the frozen
   * file; see plan §8 / OWNERSHIP). marketing: a short window, tamper control open by
   * default, no virtualisation. dashboard: the full list, windowed past
   * `virtualizeThreshold` rows, tamper control still gated by `tamperable` (false by
   * default per props.ts — dashboard-blueprint §3c: "In the dashboard there is no
   * tamper button").
   */
  surface?: ChainRailSurface;
  /**
   * RAISED. The SAME events as `events`, losslessly parsed (payload numbers may be a
   * `LosslessNumber` from src/api/lossless.ts) — same order and length. Required to
   * enable client-side verification and the tamper control (plan A8): a `JSON.parse`d
   * `AuditEvent`'s floats have already lost the lexeme a byte-exact hash needs. Pass
   * exactly the rendered window, never the whole chain (brand-gaps §2 ruling 14). Omit
   * to render read-only from `verified` / `brokenAtSeq` (as good as no `crypto.subtle`).
   */
  losslessEvents?: LosslessAuditEvent[];
  /** RAISED. Plan A9: the served items have no `tenant_id` (today's live mode). Forces
   *  read-only with the A9 note, regardless of `losslessEvents`. */
  missingTenantId?: boolean;
  /** RAISED. The endpoint printed in the provenance strip. Defaults from `variant`. */
  requestLabel?: string;
  /** RAISED. Row count past which the row list virtualises (@tanstack/react-virtual).
   *  Default 200 (plan brief). */
  virtualizeThreshold?: number;
  /** RAISED. Marketing's rows start expanded (landing-blueprint §07: the tamper field
   *  is visible without a click). Default: `surface === "marketing"`. */
  defaultExpanded?: boolean;
}

export type ChainRailComponentProps = BaseChainRailProps & ChainRailOwnProps;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actorLabel(actor: string): string {
  return actor;
}

function safeDisplayCanonicalJson(event: AuditEvent, tenantId: string): string {
  // Best-effort only — a plain JSON.parse'd AuditEvent has already lost any float
  // lexeme, so this is for DISPLAY when no lossless data is available, never for a
  // verification claim (no equality line is ever drawn from this string).
  try {
    return canonicalJson(
      auditHashDocument({
        tenant_id: tenantId,
        seq: event.seq,
        event_type: event.event_type,
        actor_type: event.actor_type,
        actor_id: event.actor_id ?? null,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        created_at: event.created_at,
      }),
    );
  } catch {
    return JSON.stringify(event.payload ?? {});
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access can be denied (permissions, non-secure context); the hash is
    // still visible and selectable, so this is a silent no-op, not an error state.
  }
}

// ---------------------------------------------------------------------------
// The verdict header
// ---------------------------------------------------------------------------

interface HeaderProps {
  guard: string;
  verified: boolean;
  checked: number;
  brokenAtSeq: number | null;
  firstSeq: number | null;
  lastSeq: number | null;
  missingTenantId: boolean;
}

function ChainHeader({ guard, verified, checked, brokenAtSeq, firstSeq, lastSeq, missingTenantId }: HeaderProps) {
  const stamp = useStamp(verified);
  const seqRange = firstSeq != null && lastSeq != null ? `${firstSeq}–${lastSeq}` : null;

  const line = verified ? (
    <span className="type-data text-text-body">
      chain.verified = <span className="text-signal-text">true</span>
      {" · "}checked {checked.toLocaleString("en-US")}
      {seqRange ? <> {"·"} seq {seqRange}</> : null}
    </span>
  ) : (
    <span className="type-data text-alarm-text">
      chain.verified = false{brokenAtSeq != null ? <> {"·"} broken_at_seq = {brokenAtSeq}</> : null}
    </span>
  );

  return (
    <div
      className={cn(
        "stamp flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule-1 px-3 py-2",
        !verified && "bg-alarm-tint",
      )}
      data-stamp={stamp}
      data-verified={verified ? "true" : "false"}
    >
      {line}
      {guard === "checking" ? <span className="type-label text-text-dim">verifying</span> : null}
      {missingTenantId ? (
        <span className="type-micro text-marker">browser verification needs tenant_id in GET /v1/audit</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

interface RowData {
  event: AuditEvent;
  previousCreatedAt: string | null;
}

/** The 1px segment from this row's node down to the next row's node.
 *  "gap": this is the last intact row before the break — the segment stops 6px short,
 *  the literal physical discontinuity (dashboard-blueprint §3c). "broken": the segment
 *  runs the full distance but dashed --alarm, because both ends are past the break. */
type Connector = "none" | "normal" | "gap" | "broken";

interface RowProps {
  data: RowData;
  index: number;
  expanded: boolean;
  onToggle: (seq: number) => void;
  desaturated: boolean;
  connector: Connector;
  guard: string;
  ready: boolean;
  tamperable: boolean;
  edited: boolean;
  generation: number;
  text: string;
  computed: string | null;
  expected: string;
  linked: boolean;
  intact: boolean;
  onChangeText: (seq: number, text: string) => void;
  onRestore: (seq: number) => void;
  labelId: string;
}


/**
 * The tamper field. Uncontrolled after mount: React renders `text` once and never
 * rewrites the text node while the visitor types. As controlled children it did, and
 * every keystroke re-rendered the node and reset the caret to position 0, so typing
 * "XY" produced "YX…". A restore remounts it (key={generation}) with the pristine text;
 * collapsing and re-expanding remounts it with the current text.
 */
function CanonicalField({ text, ...props }: { text: string } & HTMLAttributes<HTMLDivElement>) {
  const [initial] = useState(text);
  return <div {...props}>{initial}</div>;
}

function ChainRow({
  data,
  expanded,
  onToggle,
  desaturated,
  connector,
  guard,
  ready,
  tamperable,
  edited,
  generation,
  text,
  computed,
  expected,
  linked,
  intact,
  onChangeText,
  onRestore,
  labelId,
}: RowProps) {
  const { event, previousCreatedAt } = data;
  const relative = formatRelativeDelta(event.created_at, previousCreatedAt);
  const canEdit = tamperable && ready;
  const showEquality = ready && computed !== null;
  const nibble = showEquality ? firstDifferingNibbleView(expected, computed!) : null;

  const onInput = useCallback(
    (e: FormEvent<HTMLDivElement>) => {
      onChangeText(event.seq, e.currentTarget.textContent ?? "");
    },
    [event.seq, onChangeText],
  );

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // A single-line field: Enter commits (blurs) rather than inserting a newline.
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  const onPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }, []);

  return (
    <li
      className={cn("chain-rail__row relative", desaturated && "[opacity:.45] [filter:saturate(0.25)]")}
      data-seq={event.seq}
      data-broken={!intact ? "" : undefined}
    >
      <div className={cn("chain-rail__rail-node absolute left-[15px] top-3 z-10 h-[7px] w-[7px] -translate-x-1/2 rounded-full", intact ? "bg-signal-lo" : "bg-alarm")} aria-hidden />
      {connector !== "none" ? (
        <div
          className={cn(
            "absolute left-[15px] w-px -translate-x-1/2",
            connector === "normal" && "top-3 bottom-0 bg-rule-1",
            connector === "gap" && "top-3 bottom-1.5 bg-rule-1",
            connector === "broken" && "top-3 bottom-0 border-l border-dashed border-alarm",
          )}
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        id={labelId}
        aria-expanded={expanded}
        onClick={() => onToggle(event.seq)}
        className="chain-rail__row-head flex w-full min-w-0 items-center gap-2 py-1.5 pl-8 pr-3 text-left type-data hover:bg-ink-2"
      >
        <span className="w-10 shrink-0 tabular text-text-body sm:w-14">{event.seq}</span>
        <time dateTime={event.created_at} className="hidden w-[76px] shrink-0 tabular text-text-dim sm:block">
          {formatAbsoluteUtc(event.created_at)}
        </time>
        <span className="hidden w-14 shrink-0 tabular text-text-dim sm:block">{relative ?? ""}</span>
        <span className="flex shrink-0 items-center gap-1 text-text-dim sm:w-24">
          <ActorGlyph actor={event.actor_type as ActorType} />
          <span className="hidden sm:inline">{actorLabel(event.actor_type)}</span>
        </span>
        <span className="type-chip min-w-0 flex-1 truncate uppercase text-text-body">{event.event_type}</span>
        <span
          role="button"
          tabIndex={0}
          title={event.event_hash}
          onClick={(e) => {
            e.stopPropagation();
            void copyToClipboard(event.event_hash);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              void copyToClipboard(event.event_hash);
            }
          }}
          className="shrink-0 cursor-pointer text-text-dim hover:text-signal-text"
        >
          {hashShort(event.event_hash)}
        </span>
        <Play className={cn("shrink-0 text-[10px] text-text-dim transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded ? (
        <Surface elevation={1} variant="inset" as="div" className="mx-3 mb-2 flex flex-col gap-1.5 px-3 py-2" aria-labelledby={labelId}>
          <div className="type-micro flex min-w-0 gap-2 text-text-dim">
            <span className="w-24 shrink-0">prev_hash</span>
            <span className="min-w-0 truncate type-data text-text-body" title={event.prev_hash ?? "(none — genesis)"}>
              {event.prev_hash ? hashShort(event.prev_hash) : "(none — genesis)"}
            </span>
          </div>
          <div className="flex min-w-0 gap-2">
            <span className="type-micro w-24 shrink-0 pt-0.5 text-text-dim">canonical_json</span>
            <CanonicalField
              key={generation}
              text={text}
              contentEditable={canEdit}
              suppressContentEditableWarning
              spellCheck={false}
              inputMode="text"
              onInput={onInput}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              role={canEdit ? "textbox" : undefined}
              aria-label={canEdit ? `canonical_json for seq ${event.seq}` : undefined}
              aria-multiline={canEdit ? false : undefined}
              className={cn(
                "type-data min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-pre-wrap text-text-body outline-none",
                canEdit && "cursor-text rounded-data border border-dashed border-rule-2 px-1 focus-visible:[box-shadow:var(--focus-ring)]",
              )}
            />
          </div>
          {guard === "no-crypto" ? (
            <p className="type-micro text-text-dim">hash verification requires https or localhost</p>
          ) : guard === "serialiser-mismatch" ? (
            <p className="type-micro text-marker">verification unavailable — serialiser mismatch</p>
          ) : guard === "missing-tenant" ? (
            <p className="type-micro text-marker">browser verification needs tenant_id in GET /v1/audit</p>
          ) : showEquality ? (
            <div className="flex flex-col gap-0.5">
              <div className="type-micro flex min-w-0 gap-2 text-text-dim">
                <span className="w-24 shrink-0">event_hash</span>
                <span className="min-w-0 truncate type-data text-text-body">{event.event_hash}</span>
              </div>
              {intact ? (
                <p className="type-micro flex items-center gap-1 text-text-dim">
                  <Check className="text-[11px] text-signal-text" /> sha256(prev_hash ‖ canonical_json) == event_hash — verified
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <p className="type-micro flex items-center gap-1 text-alarm-text">
                    <Cross className="text-[11px]" /> sha256(prev_hash ‖ canonical_json) != event_hash
                  </p>
                  <div className="type-data flex min-w-0 gap-2">
                    <span className="type-micro w-24 shrink-0 pt-0.5 text-text-dim">expected</span>
                    <span className="min-w-0 truncate">{nibble?.expectedNode ?? expected}</span>
                  </div>
                  <div className="type-data flex min-w-0 gap-2">
                    <span className="type-micro w-24 shrink-0 pt-0.5 text-text-dim">computed</span>
                    <span className="min-w-0 truncate">{nibble?.computedNode ?? computed}</span>
                  </div>
                  {!linked ? <p className="type-micro text-alarm-text">prev_hash no longer links to the row above</p> : null}
                </div>
              )}
            </div>
          ) : null}
          {edited ? (
            <button
              type="button"
              onClick={() => onRestore(event.seq)}
              className="type-label mt-0.5 flex w-fit items-center gap-1 text-signal-text hover:text-signal-hi"
            >
              <Restore className="text-[11px]" /> restore
            </button>
          ) : null}
        </Surface>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// ChainRail
// ---------------------------------------------------------------------------

export function ChainRail({
  events,
  verified,
  brokenAtSeq = null,
  tamperable = false,
  checked,
  firstSeq,
  lastSeq,
  variant = "audit",
  surface = "marketing",
  losslessEvents,
  missingTenantId = false,
  requestLabel,
  virtualizeThreshold = 200,
  defaultExpanded,
  index,
  provenance,
  capturedAt,
  ext,
  ...rest
}: ChainRailComponentProps) {
  const baseId = useId();
  const [expandedSeqs, setExpandedSeqs] = useState<ReadonlySet<number>>(
    () => new Set((defaultExpanded ?? surface === "marketing") ? events.map((e) => e.seq) : []),
  );

  const toggle = useCallback((seq: number) => {
    setExpandedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }, []);

  const chain = useChainWindow(losslessEvents ?? null, { tamperable, missingTenantId });
  const rowStateBySeq = useMemo(() => new Map(chain.rows.map((r) => [r.seq, r])), [chain.rows]);

  const usingClientVerdict = chain.guard === "ready";
  const displayVerified = usingClientVerdict ? chain.verified : verified;
  const displayChecked = usingClientVerdict ? chain.checked : (checked ?? events.length);
  const displayBrokenAtSeq = usingClientVerdict ? chain.brokenAtSeq : brokenAtSeq;
  const displayFirstSeq = usingClientVerdict ? (chain.rows[0]?.seq ?? null) : (firstSeq ?? events[0]?.seq ?? null);
  const displayLastSeq = usingClientVerdict ? (chain.rows.at(-1)?.seq ?? null) : (lastSeq ?? events.at(-1)?.seq ?? null);

  const category = variant === "suppressions" ? "Suppression ledger" : "Audit chain";
  const defaultRequestLabel = variant === "suppressions" ? "GET /v1/suppressions" : "GET /v1/audit?limit=200";
  const lastHash = events.at(-1)?.event_hash;
  const identifier = lastHash ? `head ${hashShort(lastHash)}` : undefined;

  const rows: RowData[] = useMemo(
    () => events.map((event, i) => ({ event, previousCreatedAt: i > 0 ? events[i - 1].created_at : null })),
    [events],
  );

  const virtualize = surface === "dashboard" && rows.length > virtualizeThreshold;
  const scrollParentRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 38,
    overscan: 12,
    enabled: virtualize,
  });

  const renderRow = useCallback(
    (row: RowData, index: number) => {
      const seq = row.event.seq;
      const rowState = rowStateBySeq.get(seq);
      const ready = chain.guard === "ready";
      const text = rowState?.text ?? safeDisplayCanonicalJson(row.event, "—");
      const computed = ready ? (rowState?.computed ?? null) : null;
      const linked = rowState?.linked ?? true;
      // Not ready yet (or verification isn't available): fall back to the props-reported
      // break point rather than defaulting every row to "intact" — a genuinely broken
      // server verdict (A9's missing-tenant case, say) must still show as broken here.
      const intact = ready ? computed === row.event.event_hash && linked : displayBrokenAtSeq == null || seq < displayBrokenAtSeq;
      const desaturated = displayBrokenAtSeq != null && seq > displayBrokenAtSeq;
      const nextRow = rows[index + 1];
      let connector: Connector = "none";
      if (nextRow) {
        const nextSeq = nextRow.event.seq;
        if (displayBrokenAtSeq != null && nextSeq === displayBrokenAtSeq) connector = "gap";
        else if (displayBrokenAtSeq != null && nextSeq > displayBrokenAtSeq) connector = "broken";
        else connector = "normal";
      }

      return (
        <ChainRow
          key={seq}
          data={row}
          index={index}
          expanded={expandedSeqs.has(seq)}
          onToggle={toggle}
          desaturated={desaturated}
          connector={connector}
          guard={chain.guard}
          ready={ready}
          tamperable={Boolean(tamperable)}
          edited={rowState?.edited ?? false}
          generation={rowState?.generation ?? 0}
          text={text}
          computed={computed}
          expected={row.event.event_hash}
          linked={linked}
          intact={intact}
          onChangeText={chain.setRowText}
          onRestore={chain.restoreRow}
          labelId={`${baseId}-row-${seq}`}
        />
      );
    },
    [rowStateBySeq, chain.guard, chain.setRowText, chain.restoreRow, expandedSeqs, toggle, tamperable, rows, displayBrokenAtSeq, baseId],
  );

  return (
    <Exhibit
      index={index ?? "—"}
      category={category}
      identifier={identifier}
      provenance={requestLabel ?? provenance ?? defaultRequestLabel}
      capturedAt={capturedAt}
      ext={ext}
      density={surface === "dashboard" ? "compact" : "full"}
      as="section"
      {...rest}
    >
      <div className="chain-rail flex flex-col">
        <ChainHeader
          guard={chain.guard}
          verified={displayVerified}
          checked={displayChecked}
          brokenAtSeq={displayBrokenAtSeq}
          firstSeq={displayFirstSeq}
          lastSeq={displayLastSeq}
          missingTenantId={missingTenantId}
        />
        {chain.guard === "no-crypto" && !missingTenantId ? (
          <p className="type-micro border-b border-rule-1 px-3 py-2 text-text-dim">hash verification requires https or localhost</p>
        ) : null}
        {chain.guard === "serialiser-mismatch" ? (
          <p className="type-micro border-b border-rule-1 px-3 py-2 text-marker">verification unavailable — serialiser mismatch</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="type-micro px-3 py-4 text-text-dim">no events in this window</p>
        ) : virtualize ? (
          <div ref={(el) => { scrollParentRef.current = el; }} className="max-h-[480px] overflow-y-auto">
            <ol className="relative m-0 list-none p-0" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => (
                <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}>
                  {renderRow(rows[item.index], item.index)}
                </div>
              ))}
            </ol>
          </div>
        ) : (
          <ol className="relative m-0 list-none p-0">{rows.map((row, i) => renderRow(row, i))}</ol>
        )}
      </div>
    </Exhibit>
  );
}
