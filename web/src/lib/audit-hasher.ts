// OWNER: t6 (wave 2).
//
// Registers the canonical-JSON hasher the fixture resolver has been waiting for since
// wave 1 (src/lib/fixture-resolver.ts's "The audit hasher hook" — read-only for this
// track, imported here only). Until `installAuditHasher()` runs, a suppression appended
// in fixture mode gets `event_hash = "pending"` and does not count as `checked` in
// `GET /v1/audit`'s chain verdict; once it runs, those events are hashed with the exact
// serialiser this track ships and the chain re-verifies for real.
//
// RAISED: providers.tsx is out of this track's ownership (plan owns it to the t2a/t8/t9
// integration), so `installAuditHasher()` is not wired up from here — the integrator must
// call it once, near app start (e.g. providers.tsx or a root layout effect), same as any
// other module-scope registration. Until that call happens, fixture-mode suppressions
// keep writing "pending" hashes exactly as they do today; nothing regresses.
import { auditHashDocument } from "@/lib/canonical-json";
import { eventHash } from "@/lib/audit-verify";
import { setAuditHasher, type AuditHashDocument } from "@/lib/fixture-resolver";

/** The hasher itself, exported so a test (or a caller that wants it without the global
 *  registration side effect) can call it directly. */
export async function hashAuditDocument(document: AuditHashDocument, prevHash: string | null): Promise<string> {
  return eventHash(prevHash, auditHashDocument(document));
}

/** Register this track's canonical-JSON hasher with the fixture resolver. Idempotent —
 *  safe to call more than once (each call just replaces the registration with an
 *  equivalent one). Call once, near app start. */
export function installAuditHasher(): void {
  setAuditHasher(hashAuditDocument);
}

/** Unregister (tests, and any teardown that wants fixture-mode audit events to go back
 *  to writing "pending" hashes). */
export function uninstallAuditHasher(): void {
  setAuditHasher(null);
}
