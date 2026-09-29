// useChainVerification: the chunked walk still checks the link across every chunk
// boundary, a content edit breaks exactly the edited seq, and a prev_hash that no
// longer links is reported as a link break (not a content edit).
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChainVerification, type AuditEvent } from "@/components/routes/audit";
import { buildChain } from "./chain-fixture";

const SERVER_OK = { verified: true, checked: 0, brokenAtSeq: null, firstSeq: 1, lastSeq: 50 };

describe("useChainVerification", () => {
  it("verifies a 50-event chain walked in chunks", async () => {
    const chain = (await buildChain(50)) as unknown as AuditEvent[];
    const { result } = renderHook(() => useChainVerification(chain, { server: SERVER_OK, tamperSeq: 32 }));
    await waitFor(() => expect(result.current.state.phase).toBe("verified"));
    expect(result.current.state).toMatchObject({ checked: 50 });
    expect(result.current.rows.size).toBe(50);
  });

  it("the tamper demo breaks exactly the edited seq; restore brings it back", async () => {
    const chain = (await buildChain(50)) as unknown as AuditEvent[];
    const { result } = renderHook(() => useChainVerification(chain, { server: SERVER_OK, tamperSeq: 32 }));
    await waitFor(() => expect(result.current.state.phase).toBe("verified"));

    act(() => result.current.tamper());
    await waitFor(() => expect(result.current.state.phase).toBe("broken"), { timeout: 4000 });
    const state = result.current.state;
    if (state.phase !== "broken") throw new Error("expected broken");
    expect(state.brokenAtSeq).toBe(32);
    expect(state.linked).toBe(true);
    expect(state.expected).toBe(chain[31]!.event_hash);
    expect(state.computed).not.toBe(state.expected);
    expect(state.tamper?.field).toBe("payload.severity_band");

    act(() => result.current.restore());
    await waitFor(() => expect(result.current.state.phase).toBe("verified"), { timeout: 4000 });
  });

  it("a prev_hash that stops linking across a chunk boundary is caught (served data, server agrees)", async () => {
    const chain = (await buildChain(50)) as unknown as AuditEvent[];
    // seq 21 sits at a chunk boundary (chunks of 20 for an unpaced 50-event walk).
    chain[20] = { ...chain[20]!, prev_hash: "f".repeat(64) };
    const { result } = renderHook(() => useChainVerification(chain, { server: { ...SERVER_OK, verified: false, brokenAtSeq: 21 }, tamperSeq: null }));
    await waitFor(() => expect(result.current.state.phase).toBe("broken"));
    expect(result.current.state).toMatchObject({ brokenAtSeq: 21, tamper: null });
  });

  it("an untouched chain that fails only in the browser reads as a serialiser mismatch, never tampering", async () => {
    const chain = (await buildChain(5)) as unknown as AuditEvent[];
    chain[2] = { ...chain[2]!, event_hash: "0".repeat(64) };
    const { result } = renderHook(() => useChainVerification(chain, { server: SERVER_OK, tamperSeq: null }));
    await waitFor(() => expect(result.current.state.phase).toBe("mismatch"));
  });

  it("reports server-verdict-only when events carry no tenant id", async () => {
    const chain = ((await buildChain(5)) as unknown as AuditEvent[]).map((e) => ({ ...e, tenant_id: undefined }));
    const { result } = renderHook(() => useChainVerification(chain, { server: SERVER_OK, tamperSeq: null }));
    await waitFor(() => expect(result.current.state).toEqual({ phase: "unavailable", reason: "missing-tenant" }));
  });
});
