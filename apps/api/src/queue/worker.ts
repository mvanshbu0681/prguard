import * as jobsRepo from "../db/repos/jobs.ts";
import type { Job } from "../db/schema.ts";
import { errMessage, log } from "../log.ts";
import { waitForWork, type JobType } from "./queue.ts";

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

const handlers = new Map<string, Handler>();
let running = false;

export function registerJob(type: JobType, handler: Handler): void {
  handlers.set(type, handler);
}

export function startWorkers(count: number): void {
  if (running) return;
  running = true;
  const recovered = jobsRepo.recoverStale(60_000);
  if (recovered.length) log.warn({ jobs: recovered.map((j) => j.id) }, "recovered interrupted jobs");
  setInterval(() => {
    const stale = jobsRepo.recoverStale(60_000);
    if (stale.length) log.warn({ jobs: stale.map((j) => j.id) }, "recovered stalled jobs");
  }, 30_000).unref();
  for (let i = 0; i < count; i++) void loop(i);
  log.info({ workers: count }, "workers started");
}

async function loop(slot: number): Promise<void> {
  while (running) {
    const job = jobsRepo.claim();
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
  }
}
