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
  // array identity: guards the mount-verify effect below against re-firing — and so
  // against looping forever — when a caller passes `events` as an unstable reference
  // (e.g. an inline array literal) whose CONTENT does not actually change.
  const signature = useMemo(
    () => bases.map((b) => `${b.seq}:${b.prevHash ?? ""}:${b.expected}:${b.originalText}`).join("\u0000"),
    [bases],
  );

  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overridesRef = useRef<Map<number, string>>(new Map());
  const generationsRef = useRef<Map<number, number>>(new Map());

  const [guard, setGuard] = useState<ChainGuard>("checking");
  const [result, setResult] = useState<ChainVerifyResult>({ verified: true, checked: 0, brokenAtSeq: null, results: [] });
  const [editedSeqs, setEditedSeqs] = useState<ReadonlySet<number>>(new Set());
  const [generationTick, setGenerationTick] = useState(0);

  const runVerify = useCallback(
    async (overrideMap: ReadonlyMap<number, string>, options2: { asInitialCheck: boolean }) => {
      if (missingTenantId) {
        setGuard("missing-tenant");
        return;
      }
      if (!hasSecureCrypto()) {
        setGuard("no-crypto");
        return;
      }
      if (bases.length === 0) {
        setGuard("no-data");
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
      setGuard(options2.asInitialCheck && !verified.verified ? "serialiser-mismatch" : "ready");
    },
    [bases, missingTenantId],
  );

  // Guard 2: verify the untouched window once whenever it (re)appears. Keyed on the
  // content `signature`, not `bases`' array identity (see above) or `guard`/`result`
  // (setting either is what this effect does — including them would loop forever).
  useEffect(() => {
    overridesRef.current = new Map();
    generationsRef.current = new Map();
    setEditedSeqs(new Set());
    setGuard("checking");
    void runVerify(new Map(), { asInitialCheck: true });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, missingTenantId]);

  const setRowText = useCallback(
    (seq: number, text: string) => {
      if (!tamperable || guard !== "ready" || bases.every((b) => b.seq !== seq)) return;
      const base = bases.find((b) => b.seq === seq);
      if (!base) return;
      if (text === base.originalText) overridesRef.current.delete(seq);
      else overridesRef.current.set(seq, text);
      setEditedSeqs(new Set(overridesRef.current.keys()));

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runVerify(new Map(overridesRef.current), { asInitialCheck: false });
      }, debounceMs);
    },
    [tamperable, guard, bases, debounceMs, runVerify],
  );

  const restoreRow = useCallback(
    (seq: number) => {
      overridesRef.current.delete(seq);
      generationsRef.current.set(seq, (generationsRef.current.get(seq) ?? 0) + 1);
      setEditedSeqs(new Set(overridesRef.current.keys()));
      setGenerationTick((t) => t + 1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void runVerify(new Map(overridesRef.current), { asInitialCheck: false });
    },
    [runVerify],
  );

  const resultBySeq = useMemo(() => {
    const map = new Map<number, ChainVerifyResult["results"][number]>();
    for (const row of result.results) map.set(row.seq, row);
    return map;
  }, [result]);

  const rows = useMemo<ChainRowState[]>(() => {
    void generationTick; // rows must recompute when a restore bumps a row's generation
    return bases.map((base) => {
      const text = overridesRef.current.get(base.seq) ?? base.originalText;
      const computedRow = resultBySeq.get(base.seq);
      return {
        seq: base.seq,
        expected: base.expected,
        computed: computedRow?.computed ?? base.expected,
        linked: computedRow?.linked ?? true,
        text,
        edited: editedSeqs.has(base.seq),
        generation: generationsRef.current.get(base.seq) ?? 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bases, resultBySeq, editedSeqs, generationTick]);

  return {
    guard,
    verified: result.verified,
    checked: result.checked,
    brokenAtSeq: result.brokenAtSeq,
    rows,
    anyEdited: editedSeqs.size > 0,
    setRowText,
    restoreRow,
  };
}
