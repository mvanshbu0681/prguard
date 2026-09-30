import type { Check, ModelReviewer, Plugin } from "./define.ts";
import general from "./general.ts";
import rules from "./rules.ts";

/** Every reviewer and check, in the order they are listed in the dashboard. */
export const reviewers: Plugin[] = [general, rules];

export function enabledPlugins(disabled: string[]): Plugin[] {
  return reviewers.filter((r) => !disabled.includes(r.id));
}

export function modelReviewers(list: Plugin[]): ModelReviewer[] {
  return list.filter((p): p is ModelReviewer => p.kind === "model");
}

export function checks(list: Plugin[]): Check[] {
  return list.filter((p): p is Check => p.kind === "check");
}

/** Badge id for a reviewer id; unknown ids use themselves. */
export function badgeFor(id: string): string {
  return reviewers.find((r) => r.id === id)?.badge ?? id;
}

export { applies } from "./define.ts";
export type { Check, ModelReviewer, Plugin } from "./define.ts";
/** A model reviewer; kept as the name the review loop uses. */
export type Reviewer = ModelReviewer;
