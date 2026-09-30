import type { Reviewer } from "./define.ts";
import general from "./general.ts";

export const reviewers: Reviewer[] = [general];

export function enabledReviewers(disabled: string[]): Reviewer[] {
  return reviewers.filter((r) => !disabled.includes(r.id));
}

export type { Reviewer } from "./define.ts";
