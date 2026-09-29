"use client";
// Browser-side verification of the whole loaded chain, walked in visible steps.
//
// The hashing is the shared, engine-free verifier (src/lib/audit-verify.ts →
// `verifyWindow`, over `auditHashDocument` from src/lib/canonical-json.ts, on
// losslessly parsed payloads so Python's float lexemes survive). This hook only
// adds what the page needs around it:
//   - a walk in chunks, so "Verify again" can show progress over the events. Each
//     chunk carries its predecessor, so the link across a chunk boundary is still
//     checked; the predecessor's duplicate row is dropped.
//   - the guards <ChainRail> established: no crypto.subtle → server verdict only;
//     items without tenant_id (live mode today, plan A9) → server verdict only; the
//     untouched chain failing in the browser while the server says it is intact →
//     "serialiser mismatch", never a false alarm; a monotonic run id discards a
//     stale walk.
//   - the tamper demo: re-walk with ONE event's payload edited (never the recorded
//     hashes), which is exactly what an insider editing the database would produce.
import { useCallback, useEffect, useRef, useState } from "react";
import { verifyWindow, type ChainVerifyItem, type ChainVerifyRow } from "@/lib/audit-verify";
import { auditHashDocument } from "@/lib/canonical-json";
import { tamperEdit, type AuditEvent, type TamperEdit } from "./audit-model";

export interface ServerVerdict {
  verified: boolean;
  checked: number;
  brokenAtSeq: number | null;
  firstSeq: number | null;
  lastSeq: number | null;
}

export type VerifyState =
  | { phase: "idle" }
  | { phase: "unavailable"; reason: "no-crypto" | "missing-tenant" }
  | { phase: "walking"; done: number; total: number; seq: number; tampering: boolean }
  | { phase: "verified"; checked: number; ms: number }
  | {
      phase: "broken";
      checked: number;
      ms: number;
      brokenAtSeq: number;
      /** The recorded event_hash of the broken event. */
      expected: string;
      /** What the browser recomputed from its (possibly edited) contents. */
      computed: string;
      /** false when the break is a prev_hash that no longer links, not a content edit. */
      linked: boolean;
      /** The demo edit that caused it, or null for a break in the served data itself. */
      tamper: TamperEdit | null;
    }
  | { phase: "mismatch"; brokenAtSeq: number | null };

function documentFor(e: AuditEvent): Record<string, unknown> {
  return auditHashDocument({
    tenant_id: e.tenant_id ?? "",
    seq: e.seq,
    event_type: e.event_type,
    actor_type: e.actor_type,
    actor_id: e.actor_id,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    created_at: e.created_at,
  });
}

function hasSubtleCrypto(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-motion") === "reduced";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How long a paced walk takes end to end — long enough to be seen, short enough not to wait on. */
const PACED_MS = 1200;

export interface UseChainVerificationOptions {
  /** The server's aggregated verdict, for the mismatch guard. */
  server: ServerVerdict | null;
  /** The seq the tamper demo edits; null disables the demo. */
  tamperSeq: number | null;
}

export interface UseChainVerificationResult {
  state: VerifyState;
  /** The event the tamper demo is currently applied to, or null. */
  tampered: TamperEdit | null;
  /** Rows the walk recomputed, by seq (only once a walk has finished). */
  rows: ReadonlyMap<number, ChainVerifyRow>;
  canTamper: boolean;
  verify: (options?: { paced?: boolean }) => void;
  tamper: () => void;
  restore: () => void;
}

export function useChainVerification(events: readonly AuditEvent[] | null, { server, tamperSeq }: UseChainVerificationOptions): UseChainVerificationResult {
  const [state, setState] = useState<VerifyState>({ phase: "idle" });
  const [tampered, setTampered] = useState<TamperEdit | null>(null);
  const [rows, setRows] = useState<ReadonlyMap<number, ChainVerifyRow>>(new Map());
  const runId = useRef(0);
  const serverRef = useRef(server);
  useEffect(() => {
    serverRef.current = server;
  }, [server]);

  const target = tamperSeq !== null && events ? (events.find((e) => e.seq === tamperSeq) ?? null) : null;

  const walk = useCallback(
    async (edit: TamperEdit | null, paced: boolean) => {
      if (!events || events.length === 0) return;
      const id = (runId.current += 1);
      if (events.every((e) => !e.tenant_id)) {
        setState({ phase: "unavailable", reason: "missing-tenant" });
        return;
      }
      if (!hasSubtleCrypto()) {
        setState({ phase: "unavailable", reason: "no-crypto" });
        return;
      }
      const reduce = prefersReducedMotion();
      const pace = paced && !reduce;
      const items: ChainVerifyItem[] = events.map((e) => ({
        seq: e.seq,
        prevHash: e.prev_hash,
        expectedHash: e.event_hash,
        document: documentFor(edit && e.seq === edit.event.seq ? edit.event : e),
      }));
      const total = items.length;
      const chunk = Math.max(20, Math.ceil(total / (pace ? 36 : 6)));
      const results: ChainVerifyRow[] = [];
      const t0 = performance.now();
      setState({ phase: "walking", done: 0, total, seq: items[0].seq, tampering: Boolean(edit) });
      for (let start = 0; start < total; start += chunk) {
        const slice = items.slice(Math.max(0, start - 1), start + chunk);
        const r = await verifyWindow(slice);
        if (id !== runId.current) return; // a newer walk started: this one is stale
        results.push(...(start === 0 ? r.results : r.results.slice(1)));
        const done = Math.min(total, start + chunk);
        setState({ phase: "walking", done, total, seq: items[done - 1].seq, tampering: Boolean(edit) });
        if (pace) {
          const due = (PACED_MS * done) / total - (performance.now() - t0);
          if (due > 0) await sleep(due);
          if (id !== runId.current) return;
        } else {
          await Promise.resolve();
        }
      }
      const ms = performance.now() - t0;
      const byseq = new Map(results.map((row) => [row.seq, row]));
      setRows(byseq);
      const broken = results.find((row) => row.computed !== row.expected || !row.linked) ?? null;
      if (!broken) {
        setState({ phase: "verified", checked: total, ms });
        return;
      }
      const verdict = serverRef.current;
      if (!edit && (!verdict || verdict.verified)) {
        // The untouched chain fails here but not on the server: the browser's
        // serialiser disagrees with the backend's. Say so; never claim tampering.
        setState({ phase: "mismatch", brokenAtSeq: broken.seq });
        return;
      }
      setState({ phase: "broken", checked: total, ms, brokenAtSeq: broken.seq, expected: broken.expected, computed: broken.computed, linked: broken.linked, tamper: edit });
    },
    [events],
  );

  // Verify once, quietly, whenever a new chain arrives. The walk is asynchronous:
  // every setState in it runs after an await, never synchronously in this effect.
  const signature = events ? `${events.length}:${events[0]?.seq}:${events.at(-1)?.event_hash}` : "";
  useEffect(() => {
    if (!events || events.length === 0) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      setTampered(null);
      void walk(null, false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on the chain's content, not its array identity
  }, [signature]);

  const verify = useCallback((options: { paced?: boolean } = {}) => void walk(tampered, options.paced ?? true), [walk, tampered]);

  const tamper = useCallback(() => {
    if (!target) return;
    const edit = tamperEdit(target);
    setTampered(edit);
    void walk(edit, true);
  }, [target, walk]);

  const restore = useCallback(() => {
    setTampered(null);
    void walk(null, true);
  }, [walk]);

  return { state, tampered, rows, canTamper: target !== null, verify, tamper, restore };
}
