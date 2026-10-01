import { config } from "../config.ts";
import * as jobsRepo from "../db/repos/jobs.ts";
import type { Job } from "../db/schema.ts";
import { errMessage, log } from "../log.ts";
import { waitForWork, wake, type JobType } from "./queue.ts";

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}

/** A failure that retrying will not fix. */
export class FatalError extends Error {}

export type JobContext = {
  job: Job;
  /** Throws CancelledError when a newer job has replaced this one. */
  checkCancelled: () => void;
  isLastAttempt: boolean;
};

type Handler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;
type AbandonHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, Handler>();
const abandonHandlers = new Map<string, AbandonHandler>();
let running = false;
const STALE_MS = 30_000;

/** `onAbandon` runs when a job is given up for good outside its handler (e.g. its worker died on the last attempt). */
export function registerJob(type: JobType, handler: Handler, onAbandon?: AbandonHandler): void {
  handlers.set(type, handler);
  if (onAbandon) abandonHandlers.set(type, onAbandon);
}

function recover(): void {
  const stale = jobsRepo.recoverStale(STALE_MS);
  if (!stale.length) return;
  log.warn({ jobs: stale.map((s) => s.job.id) }, "recovered interrupted jobs");
  for (const { job, outcome } of stale) {
    if (outcome === "failed") void abandonHandlers.get(job.type)?.(job.payload).catch(() => {});
  }
  wake();
}

export function startWorkers(count: number): void {
  if (running) return;
  running = true;
  // Heartbeats land every 10s, so a running job silent for 30s belongs to a worker that died.
  recover();
  setInterval(recover, 10_000).unref();
  for (let i = 0; i < count; i++) void loop(i);
  log.info({ workers: count }, "workers started");
}

async function loop(slot: number): Promise<void> {
  while (running) {
    // Reviews spend most of the model budget: a few at a time, the rest wait their turn in order.
    const job = jobsRepo.claim(config.reviewConcurrency);
    if (!job) {
      await waitForWork(1000 + slot * 50);
      continue;
    }
    await run(job, slot);
  }
}

async function run(job: Job, slot: number): Promise<void> {
  const jobLog = log.child({ job: job.id, type: job.type, worker: slot });
  const handler = handlers.get(job.type);
  if (!handler) {
    jobsRepo.fail(job, `No handler for ${job.type}`, null);
    return;
  }
  const beat = setInterval(() => jobsRepo.heartbeat(job.id), 10_000);
  const started = Date.now();
  jobLog.info({ attempt: job.attempts }, "job started");
  try {
    await handler(job.payload, {
      job,
      isLastAttempt: job.attempts >= job.maxAttempts,
      checkCancelled: () => {
        if (jobsRepo.isCancelRequested(job.id)) throw new CancelledError();
      },
    });
    jobsRepo.finish(job.id);
    jobLog.info({ ms: Date.now() - started }, "job done");
  } catch (err) {
    if (err instanceof CancelledError) {
      jobsRepo.markCancelled(job.id);
      jobLog.info("job cancelled");
    } else {
      const retry = err instanceof FatalError ? null : 5_000 * job.attempts ** 2;
      const outcome = jobsRepo.fail(job, errMessage(err), retry);
      jobLog.error({ err: errMessage(err), outcome }, "job failed");
    }
  } finally {
    clearInterval(beat);
    // A job for the same PR may have been waiting on this one.
    wake();
  }
}
