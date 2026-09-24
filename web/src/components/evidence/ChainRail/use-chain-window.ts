"use client";
// OWNER: t6 (wave 2). The browser-side verification state behind <ChainRail>: the four
// required guards (brand-gaps §G "Tamper control guards"), the 120ms-debounced tamper
// recompute (motion §4.8.3), and "recompute the RENDERED WINDOW only, never the whole
// chain" (brand-gaps §2 ruling 14). Separated from ChainRail.tsx so the guards are
// testable with `renderHook` in isolation from markup (tests/unit/evidence/chain-rail/).
//
// Engine-free: no gsap, no '@/motion/useReplay' — src/components/evidence/** ships on
// both surfaces and must never drag GSAP into the dashboard (plan toolchain facts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseLosslessJson } from "@/api/lossless";
import { verifyWindow, type ChainVerifyItem, type ChainVerifyResult } from "@/lib/audit-verify";
import { auditHashDocument, canonicalJson } from "@/lib/canonical-json";
import type { ActorType } from "@/lib/contracts";

/** One event of the rendered window, losslessly parsed (payload values may be a
 *  `LosslessNumber` — see src/api/lossless.ts) so hashing reproduces the backend's
 *  Python-`repr()` floats exactly. Same shape as `AuditItemWithTenant`
 *  (@/lib/fixture-types), typed locally so this module never has to import a JSON.parse'd
 *  `AuditEvent` and risk the two being confused. */
export interface LosslessAuditEvent {
  seq: number;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  payload: unknown;
  created_at: string;
  /** Plan A9: absent in live mode (the API's AuditItem carries no tenant_id today). */
  tenant_id?: string;
  event_hash: string;
  prev_hash: string | null;
}

export type ChainGuard =
  /** Guard 4/A9: the served items have no tenant_id — client verification is impossible. */
  | "missing-tenant"
  /** Guard 1: no secure context or no crypto.subtle. */
  | "no-crypto"
  /** No lossless data was supplied at all — nothing to verify client-side. */
  | "no-data"
  /** The untouched-window check (guard 2) is in flight. */
  | "checking"
  /** Guard 2: the untouched window failed to verify — a serialiser bug, never tamper. */
  | "serialiser-mismatch"
  /** Verification is live; tampering (if `tamperable`) is possible. */
  | "ready";

export interface ChainRowState {
  seq: number;
  /** The row's recorded `event_hash` — the tamper control never edits this. */
  expected: string;
  /** `eventHash(prevHash, currentDocument)`, recomputed from the row's (possibly edited)
   *  canonical_json text. */
  computed: string;
  linked: boolean;
  /** The row's current canonical_json text: the original, or the visitor's edit. */
  text: string;
  /** `text !== ` the original canonical_json for this row. */
  edited: boolean;
  /** Bumped on `restoreRow(seq)`; use it in the contenteditable's React `key` to force a
   *  fresh, uncontrolled remount back to `text` (the original). */
  generation: number;
}

export interface UseChainWindowResult {
  guard: ChainGuard;
  verified: boolean;
  checked: number;
  brokenAtSeq: number | null;
  /** Rows in the same order as the input window. */
  rows: ChainRowState[];
  /** `true` once any row differs from its original canonical_json. */
  anyEdited: boolean;
  /** Debounced (120ms): call on every keystroke inside a row's contenteditable field. */
  setRowText: (seq: number, text: string) => void;
  /** Restore one row's canonical_json to its original text and re-verify immediately. */
  restoreRow: (seq: number) => void;
}

function hasSecureCrypto(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

function documentFor(event: LosslessAuditEvent): Record<string, unknown> {
  return auditHashDocument({
    tenant_id: event.tenant_id ?? "",
    seq: event.seq,
    event_type: event.event_type,
    actor_type: event.actor_type,
    actor_id: event.actor_id,
    payload: (event.payload ?? {}) as Record<string, unknown>,
    created_at: event.created_at,
  });
}

interface RowBase {
  seq: number;
  prevHash: string | null;
  expected: string;
  originalText: string;
}

export interface UseChainWindowOptions {
  tamperable?: boolean;
  missingTenantId?: boolean;
  debounceMs?: number;
}

const EMPTY_RESULT: ChainVerifyResult = { verified: true, checked: 0, brokenAtSeq: null, results: [] };

/** The guards known synchronously from PROPS alone — safe to compute during render,
 *  including the very first (server) render, because they never read `window` or
 *  `crypto`. Guard 1 (secure context / `crypto.subtle`) is NOT here: `window` does not
 *  exist during SSR, so folding it into this function would render "no-crypto" on the
 *  server and something else on the client's first render — a hydration mismatch. It is
 *  checked instead inside the mount effect below, which never runs during SSR and runs
 *  identically (client-only) whether the page was static or hydrated. `null` means "no
 *  synchronous guard applies yet". */
function propsGuardFor(missingTenantId: boolean, baseCount: number): "missing-tenant" | "no-data" | null {
  if (missingTenantId) return "missing-tenant";
  if (baseCount === 0) return "no-data";
  return null;
}

export function useChainWindow(events: readonly LosslessAuditEvent[] | null, options: UseChainWindowOptions = {}): UseChainWindowResult {
  const { tamperable = false, missingTenantId = false, debounceMs = 120 } = options;

  const bases = useMemo<RowBase[]>(
    () =>
      (events ?? []).map((event) => ({
        seq: event.seq,
        prevHash: event.prev_hash,
        expected: event.event_hash,
        originalText: canonicalJson(documentFor(event)),
      })),
    [events],
  );

  // A content signature, not `bases`' own (recreated-every-render-if-`events`-is-unstable)
  // array identity: guards the reset-on-change logic below against re-firing — and so
  // against looping forever — when a caller passes `events` as an unstable reference
  // (e.g. an inline array literal) whose CONTENT does not actually change.
  const signature = useMemo(
    () => bases.map((b) => `${b.seq}:${b.prevHash ?? ""}:${b.expected}:${b.originalText}`).join("\u0000"),
    [bases],
  );

  // "no-data" and A9's missing-tenant are pure functions of props — computed during
  // render, never via an effect (and safe during SSR: see propsGuardFor). Guard 1
  // (secure context) and guard 2 (the async untouched-window check) are both resolved
  // in the mount effect below, since guard 1 needs `window`/`crypto`, which do not exist
  // during SSR.
  const propsGuard = propsGuardFor(missingTenantId, bases.length);

  const [envGuard, setEnvGuard] = useState<"checking" | "no-crypto" | "serialiser-mismatch" | "ready">("checking");
  const [result, setResult] = useState<ChainVerifyResult>(EMPTY_RESULT);
  const [overrides, setOverrides] = useState<ReadonlyMap<number, string>>(new Map());
  const [generations, setGenerations] = useState<ReadonlyMap<number, number>>(new Map());

  // "Adjusting state when a prop changes" (react.dev): a state update made DURING RENDER,
  // not inside an effect, is the supported way to reset local state exactly once when the
  // window's content signature changes — React re-renders immediately with the reset
  // state, before anything commits, so no stale UI is ever shown and no effect ever calls
  // setState synchronously in its body.
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) {
    setSyncedSignature(signature);
    setEnvGuard("checking");
    setResult(EMPTY_RESULT);
    setOverrides(new Map());
    setGenerations(new Map());
  }

  const guard: ChainGuard = propsGuard ?? envGuard;

  // Refs are never read during render (only inside the debounce timer and the event
  // handlers that also update `overrides` above) — this shadow exists purely so the
  // 120ms-debounced callback can see the LATEST edits without a stale closure. It is
  // written only from an effect or an event handler, never during render.
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overridesShadowRef = useRef<ReadonlyMap<number, string>>(overrides);
  useEffect(() => {
    overridesShadowRef.current = overrides;
  }, [overrides]);

  const runVerify = useCallback(
    async (overrideMap: ReadonlyMap<number, string>, verifyOptions: { asInitialCheck: boolean }) => {
      // Yield once before touching `window`/`crypto` (guard 1): this function only ever
      // runs from an effect (never during render or SSR), but the yield keeps every
      // setState call below strictly asynchronous relative to whatever triggered this
      // call, so a burst of calls (a fast-typing tamper edit) never cascades synchronous
      // re-renders within one commit.
      await Promise.resolve();
      if (!hasSecureCrypto()) {
        setEnvGuard("no-crypto");
        return;
      }
      const id = (requestIdRef.current += 1);
      const items: ChainVerifyItem[] = bases.map((base) => {
        const text = overrideMap.get(base.seq) ?? base.originalText;
        let document: unknown = null;
        try {
          document = parseLosslessJson(text);
        } catch {
          // An unparsable edit cannot hash to the recorded value either — it just always
          // breaks its own row, which is the correct outcome for garbled input.
          document = { __unparsable__: text };
        }
        return { seq: base.seq, prevHash: base.prevHash, expectedHash: base.expected, document };
      });
      const verified = await verifyWindow(items);
      if (id !== requestIdRef.current) return; // guard 3: a stale digest is discarded
      setResult(verified);
      // Guard 2 fires only for the untouched window; an edit that breaks the chain is the
      // feature, not a serialiser bug.
      setEnvGuard(verifyOptions.asInitialCheck && !verified.verified ? "serialiser-mismatch" : "ready");
    },
    [bases],
  );

  // Guard 1 and guard 2: verify the untouched window once whenever it (re)appears,
  // provided no props guard already rules it out. `runVerify` itself yields before
  // touching `window`/`crypto` or calling setState (see above), so nothing here runs
  // synchronously in this effect's own call stack — but react-hooks/set-state-in-effect
  // flags the call site by call-graph reachability (it can see `runVerify` eventually
  // calls a setter) regardless of that internal await, which is exactly the "subscribe
  // to an external system, call setState when it changes" case the rule's own docs carve
  // out (react.dev/learn/you-might-not-need-an-effect): `crypto.subtle.digest` is exactly
  // such an external system. Disabled with that read, not to silence a real bug.
  useEffect(() => {
    if (propsGuard !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runVerify(new Map(), { asInitialCheck: true });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, propsGuard]);

  const setRowText = useCallback(
    (seq: number, text: string) => {
      if (!tamperable || guard !== "ready") return;
      const base = bases.find((b) => b.seq === seq);
      if (!base) return;

      setOverrides((prev) => {
        const next = new Map(prev);
        if (text === base.originalText) next.delete(seq);
        else next.set(seq, text);
        return next;
      });

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runVerify(new Map(overridesShadowRef.current), { asInitialCheck: false });
      }, debounceMs);
    },
    [tamperable, guard, bases, debounceMs, runVerify],
  );

  const restoreRow = useCallback(
    (seq: number) => {
      if (guard !== "ready") return;
      const withoutSeq = new Map(overridesShadowRef.current);
      withoutSeq.delete(seq);

      setOverrides(withoutSeq);
      setGenerations((prev) => {
        const next = new Map(prev);
        next.set(seq, (next.get(seq) ?? 0) + 1);
        return next;
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void runVerify(withoutSeq, { asInitialCheck: false });
    },
    [guard, runVerify],
  );

  const resultBySeq = useMemo(() => {
    const map = new Map<number, ChainVerifyResult["results"][number]>();
    for (const row of result.results) map.set(row.seq, row);
    return map;
  }, [result]);

  const rows = useMemo<ChainRowState[]>(
    () =>
      bases.map((base) => {
        const text = overrides.get(base.seq) ?? base.originalText;
        const computedRow = resultBySeq.get(base.seq);
        return {
          seq: base.seq,
          expected: base.expected,
          computed: computedRow?.computed ?? base.expected,
          linked: computedRow?.linked ?? true,
          text,
          edited: overrides.has(base.seq),
          generation: generations.get(base.seq) ?? 0,
        };
      }),
    [bases, resultBySeq, overrides, generations],
  );

  return {
    guard,
    verified: result.verified,
    checked: result.checked,
    brokenAtSeq: result.brokenAtSeq,
    rows,
    anyEdited: overrides.size > 0,
    setRowText,
    restoreRow,
  };
}
