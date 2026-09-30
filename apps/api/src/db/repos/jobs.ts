import { and, eq, inArray, like, lt, or, sql } from "drizzle-orm";
import { db } from "../client.ts";
import { jobs, type Job } from "../schema.ts";

/**
 * Inserts a job. A queued job with the same key is cancelled (returned so the caller can close out
 * its work) and a running one is asked to stop.
 */
export function enqueue(type: string, key: string, payload: Record<string, unknown>, maxAttempts = 3): { job: Job; cancelled: Job[] } {
  const now = Date.now();
  return db.transaction((tx) => {
    const cancelled = tx
      .update(jobs)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(eq(jobs.key, key), eq(jobs.status, "queued")))
      .returning()
      .all();
    tx.update(jobs)
      .set({ cancelRequested: true, updatedAt: now })
      .where(and(eq(jobs.key, key), eq(jobs.status, "running")))
      .run();
    const job = tx
      .insert(jobs)
      .values({ type, key, payload, maxAttempts, runAfter: now, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return { job, cancelled };
  });
}

/** Atomically takes the oldest runnable job. */
export function claim(): Job | undefined {
  const now = Date.now();
  return db
    .update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, heartbeatAt: now, updatedAt: now })
    .where(
      eq(
        jobs.id,
        sql`(select ${jobs.id} from ${jobs} where ${jobs.status} = 'queued' and ${jobs.runAfter} <= ${now} order by ${jobs.id} limit 1)`,
      ),
    )
    .returning()
    .get();
}

export function heartbeat(id: number): void {
  db.update(jobs).set({ heartbeatAt: Date.now() }).where(eq(jobs.id, id)).run();
}

export function finish(id: number): void {
  db.update(jobs).set({ status: "done", updatedAt: Date.now() }).where(eq(jobs.id, id)).run();
}

export function markCancelled(id: number): void {
  db.update(jobs).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(jobs.id, id)).run();
}

/** Fails a job, or puts it back in the queue after `retryInMs` when attempts remain. */
export function fail(job: Job, error: string, retryInMs: number | null): "retry" | "failed" {
  const now = Date.now();
  if (retryInMs !== null && job.attempts < job.maxAttempts) {
    db.update(jobs)
      .set({ status: "queued", error, runAfter: now + retryInMs, updatedAt: now })
      .where(eq(jobs.id, job.id))
      .run();
    return "retry";
  }
  db.update(jobs).set({ status: "failed", error, updatedAt: now }).where(eq(jobs.id, job.id)).run();
  return "failed";
}

export function isCancelRequested(id: number): boolean {
  const row = db.select({ c: jobs.cancelRequested, s: jobs.status }).from(jobs).where(eq(jobs.id, id)).get();
  return !row || row.c || row.s === "cancelled";
}

/** Cancels queued jobs with a key (or key prefix) and flags running ones. Returns the queued ones cancelled. */
export function cancelByKey(key: string, prefix = false): Job[] {
  const now = Date.now();
  const match = prefix ? like(jobs.key, `${key}%`) : eq(jobs.key, key);
  return db.transaction((tx) => {
    const cancelled = tx
      .update(jobs)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(match, eq(jobs.status, "queued")))
      .returning()
      .all();
    tx.update(jobs)
      .set({ cancelRequested: true, updatedAt: now })
      .where(and(match, eq(jobs.status, "running")))
      .run();
    return cancelled;
  });
}

/** Running jobs whose worker stopped heartbeating go back to the queue (or fail when out of attempts). */
export function recoverStale(staleMs: number): Job[] {
  const cutoff = Date.now() - staleMs;
  const stale = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "running"), or(lt(jobs.heartbeatAt, cutoff), sql`${jobs.heartbeatAt} is null`)))
    .all();
  for (const job of stale) fail(job, "Interrupted", 0);
  return stale;
}

export function countByStatus(statuses: Job["status"][]): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(jobs)
    .where(inArray(jobs.status, statuses))
    .get()!.n;
}
