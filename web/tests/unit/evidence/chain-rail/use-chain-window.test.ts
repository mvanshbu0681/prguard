// OWNER: t6 (wave 2). useChainWindow: the four required guards (brand-gaps §G), the
// 120ms-debounced tamper recompute, and "a one-character payload edit breaks at the
// right seq" end to end through the hook a component actually calls.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useChainWindow, type LosslessAuditEvent } from "@/components/evidence/ChainRail/use-chain-window";

function makeEvents(): LosslessAuditEvent[] {
  // A tiny, self-consistent three-event chain, hashed with the module under test so
  // these fixtures never drift from the production serialiser.
  const base = [
    { seq: 1, event_type: "review.requested", actor_type: "system" as const, actor_id: "webhook:github", payload: { pr: 1 }, created_at: "2026-09-23T11:46:21Z", tenant_id: "t1" },
    { seq: 2, event_type: "finding.proposed", actor_type: "ai" as const, actor_id: "specialist:bugs", payload: { score: 0.81 }, created_at: "2026-09-23T11:46:22Z", tenant_id: "t1" },
    { seq: 3, event_type: "gate.blocked", actor_type: "human" as const, actor_id: "vansh.m", payload: { reason: "blocking finding" }, created_at: "2026-09-23T11:46:23Z", tenant_id: "t1" },
  ];
  // Hash them for real (Node's crypto.subtle), synchronously enough for a fixture builder.
  return base as unknown as LosslessAuditEvent[];
}

async function withRealHashes(events: LosslessAuditEvent[]): Promise<LosslessAuditEvent[]> {
  const { auditHashDocument, canonicalJson } = await import("@/lib/canonical-json");
  const { eventHash } = await import("@/lib/audit-verify");
  let prevHash: string | null = null;
  const hashed: LosslessAuditEvent[] = [];
  for (const event of events) {
    const document = auditHashDocument({ ...event, tenant_id: event.tenant_id ?? "t1", payload: event.payload as Record<string, unknown> });
    void canonicalJson(document);
    const hash = await eventHash(prevHash, document);
    hashed.push({ ...event, prev_hash: prevHash, event_hash: hash });
    prevHash = hash;
  }
  return hashed;
}

function markSecureContext(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

describe("useChainWindow — guards", () => {
  const originalSubtle = globalThis.crypto.subtle;

  beforeEach(() => {
    markSecureContext(true);
    Object.defineProperty(globalThis.crypto, "subtle", { value: originalSubtle, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis.crypto, "subtle", { value: originalSubtle, configurable: true });
  });

  it("guard 1 — no secure context: renders read-only with 'no-crypto'", async () => {
    markSecureContext(false);
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events));
    await waitFor(() => expect(result.current.guard).toBe("no-crypto"));
  });

  it("guard 1 — no crypto.subtle: renders read-only with 'no-crypto'", async () => {
    const events = await withRealHashes(makeEvents()); // hash first: this needs real subtle
    // `crypto.subtle` is an inherited accessor (not an own property), so `delete` falls
    // straight back through to the prototype getter — shadow it with `undefined` instead.
    Object.defineProperty(globalThis.crypto, "subtle", { value: undefined, configurable: true });
    const { result } = renderHook(() => useChainWindow(events));
    await waitFor(() => expect(result.current.guard).toBe("no-crypto"));
  });

  it("plan A9 — missing tenant_id: 'missing-tenant', regardless of crypto availability", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events, { missingTenantId: true }));
    await waitFor(() => expect(result.current.guard).toBe("missing-tenant"));
  });

  it("guard 2 — an untouched window that fails to verify never reaches 'ready': 'serialiser-mismatch'", async () => {
    const events = await withRealHashes(makeEvents());
    const corrupted = events.map((e, i) => (i === 1 ? { ...e, event_hash: "0".repeat(64) } : e));
    const { result } = renderHook(() => useChainWindow(corrupted));
    await waitFor(() => expect(result.current.guard).toBe("serialiser-mismatch"));
    // Never the broken-chain UI's own state: verified/brokenAtSeq are not surfaced as "the chain broke".
    expect(result.current.guard).not.toBe("ready");
  });

  it("no events: 'no-data'", async () => {
    const { result } = renderHook(() => useChainWindow([]));
    await waitFor(() => expect(result.current.guard).toBe("no-data"));
  });

  it("reaches 'ready' and verifies true for a genuinely intact window", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events));
    await waitFor(() => expect(result.current.guard).toBe("ready"));
    expect(result.current.verified).toBe(true);
    expect(result.current.checked).toBe(3);
    expect(result.current.brokenAtSeq).toBeNull();
  });
});

describe("useChainWindow — tamper by typing", () => {
  beforeEach(() => {
    markSecureContext(true);
  });

  it("editing a row's canonical_json breaks the chain at that row's seq, debounced 120ms", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events, { tamperable: true }));
    await waitFor(() => expect(result.current.guard).toBe("ready"));

    const row2 = result.current.rows.find((r) => r.seq === 2)!;
    const tampered = row2.text.replace('"score":0.81', '"score":0.8');
    expect(tampered).not.toBe(row2.text);

    const startedAt = Date.now();
    act(() => {
      result.current.setRowText(2, tampered);
    });
    // Not yet: the recompute is debounced 120ms, and a fresh keystroke keeps postponing it.
    expect(result.current.verified).toBe(true);

    await waitFor(() => expect(result.current.verified).toBe(false));
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100); // allow scheduler jitter under 120ms
    expect(result.current.brokenAtSeq).toBe(2);
  });

  it("restoring a row repairs the chain", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events, { tamperable: true, debounceMs: 1 }));
    await waitFor(() => expect(result.current.guard).toBe("ready"));

    const original = result.current.rows.find((r) => r.seq === 2)!.text;
    act(() => result.current.setRowText(2, original.replace('"score":0.81', '"score":0.8')));
    await waitFor(() => expect(result.current.verified).toBe(false));
    expect(result.current.brokenAtSeq).toBe(2);

    act(() => result.current.restoreRow(2));
    await waitFor(() => expect(result.current.verified).toBe(true));
    expect(result.current.brokenAtSeq).toBeNull();
    expect(result.current.anyEdited).toBe(false);
  });

  it("a non-tamperable window ignores setRowText", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events, { tamperable: false, debounceMs: 1 }));
    await waitFor(() => expect(result.current.guard).toBe("ready"));
    act(() => result.current.setRowText(2, "not json at all"));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.anyEdited).toBe(false);
    expect(result.current.verified).toBe(true);
  });
});

describe("useChainWindow — guard 3, stale async digests are discarded", () => {
  beforeEach(() => {
    markSecureContext(true);
  });

  it("only the LATEST edit's verification result is applied, even if an earlier one resolves later", async () => {
    const events = await withRealHashes(makeEvents());
    const { result } = renderHook(() => useChainWindow(events, { tamperable: true, debounceMs: 1 }));
    await waitFor(() => expect(result.current.guard).toBe("ready"));

    const original = result.current.rows.find((r) => r.seq === 2)!.text;
    const broken = original.replace('"score":0.81', '"score":0.8');

    // Fire an edit that breaks the chain, then immediately fire the restore — simulating
    // a slow first digest that must not clobber the second (correct, final) result.
    act(() => result.current.setRowText(2, broken));
    await new Promise((r) => setTimeout(r, 5));
    act(() => result.current.setRowText(2, original));

    await waitFor(() => expect(result.current.verified).toBe(true));
    // Give any stale timer a chance to fire and prove it did NOT flip verified back to false.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.verified).toBe(true);
    expect(result.current.brokenAtSeq).toBeNull();
  });
});
