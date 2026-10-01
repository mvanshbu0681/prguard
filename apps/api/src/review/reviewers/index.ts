import secrets from "../checks/secrets.ts";
import supplyChain from "../checks/supply-chain.ts";
import type { Check, ModelReviewer, Plugin } from "./define.ts";
import breaking from "./breaking.ts";
import data from "./data.ts";
import docs from "./docs.ts";
import general from "./general.ts";
import performance from "./performance.ts";
import reliability from "./reliability.ts";
import rules from "./rules.ts";
import security from "./security.ts";
import slop from "./slop.ts";
import tests from "./tests.ts";

/** Every reviewer and check, in the order they are listed in the dashboard. */
export const reviewers: Plugin[] = [general, security, reliability, breaking, performance, data, slop, rules, docs, tests, secrets, supplyChain];

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

/** How the dashboard lists plugins. */
export function reviewerInfo(p: Plugin): { id: string; name: string; description: string; badge: string; kind: "model" | "check" } {
  return { id: p.id, name: p.name, description: p.description, badge: p.badge, kind: p.kind };
}

/** The reviewers behind a finding (`general+security`), named, at most two. */
export function reviewerRefs(reviewer: string): { id: string; name: string; badge: string }[] {
  return reviewer
    .split("+")
    .slice(0, 2)
    .map((id) => {
      const p = reviewers.find((r) => r.id === id);
      return { id, name: p?.name ?? id, badge: p?.badge ?? id };
    });
}

export { applies } from "./define.ts";
export type { Check, ModelReviewer, Plugin } from "./define.ts";
/** A model reviewer; kept as the name the review loop uses. */
export type Reviewer = ModelReviewer;
