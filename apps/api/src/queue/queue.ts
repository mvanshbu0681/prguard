import { EventEmitter } from "node:events";
import * as jobsRepo from "../db/repos/jobs.ts";
import type { Job } from "../db/schema.ts";

export type JobType = "review_pr" | "index_repo" | "pr_command" | "pr_reply" | "sweep_reactions";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function enqueue(type: JobType, key: string, payload: Record<string, unknown>): { job: Job; cancelled: Job[] } {
  const result = jobsRepo.enqueue(type, key, payload);
  bus.emit("job");
  return result;
}

export function wake(): void {
  bus.emit("job");
}

export function cancelKey(key: string, prefix = false): Job[] {
  return jobsRepo.cancelByKey(key, prefix);
}

/** Enqueues a job only if its key was never used, so a redelivered comment never runs twice. */
export function enqueueOnce(type: JobType, key: string, payload: Record<string, unknown>): boolean {
  if (jobsRepo.hasKey(key)) return false;
  enqueue(type, key, payload);
  return true;
}

export function reviewKey(repositoryId: number, number: number): string {
  return `pr:${repositoryId}:${number}`;
}

export function briefKey(repositoryId: number): string {
  return `repo:${repositoryId}`;
}

/** Resolves when a job is enqueued in this process or after `ms`, whichever comes first. */
export function waitForWork(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      bus.off("job", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    bus.on("job", done);
  });
}
