import * as reviewsRepo from "../db/repos/reviews.ts";
import type { ReviewTrace, TraceStep } from "../db/schema.ts";
import { errMessage, log } from "../log.ts";

/** Records how a review ran: each step's status, duration and a one-line result. Saved on every exit. */
export class Tracer {
  readonly data: ReviewTrace = { steps: [] };

  async step<T>(key: TraceStep["key"], label: string, fn: () => Promise<T>, detail?: (result: T) => string): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.data.steps.push({ key, label, status: "ok", ms: Date.now() - started, detail: detail ? detail(result) : "" });
      return result;
    } catch (err) {
      this.data.steps.push({ key, label, status: "failed", ms: Date.now() - started, detail: "Failed" });
      throw err;
    }
  }

  /** A step measured by the caller (from `started`), or one that did not run. */
  add(key: TraceStep["key"], label: string, started: number | null, detail: string, status: TraceStep["status"] = "ok"): void {
    this.data.steps.push({ key, label, status, ms: started === null ? 0 : Date.now() - started, detail });
  }

  save(reviewId: number): void {
    try {
      reviewsRepo.update(reviewId, { trace: this.data });
    } catch (err) {
      log.warn({ review: reviewId, err: errMessage(err) }, "could not save the trace");
    }
  }
}
