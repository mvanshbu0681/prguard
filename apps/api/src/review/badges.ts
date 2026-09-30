import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import type { Severity } from "./types.ts";

type Meta = { width: number; height: number; alt: string };

// Written by `npm run badges` next to the images published at ASSET_BASE_URL.
const manifest: Record<string, Meta> = JSON.parse(readFileSync(join(import.meta.dirname, "badges.json"), "utf8"));

const MAX_COUNT = 20;

export type Priority = "p0" | "p1" | "p2" | "p3";
export type RiskLevel = "low" | "medium" | "high";
export type StatusKind = "fixed" | "new" | "open" | "learned";

function images(): boolean {
  return config.assetBaseUrl !== "";
}

/** One badge as an image tag, or a bold text label when images are off. Unknown names render nothing. */
export function badge(name: string): string {
  const meta = manifest[name];
  if (!meta) return "";
  if (!images()) return `**${meta.alt}**`;
  return `<img src="${config.assetBaseUrl}/${name}.png" width="${meta.width}" height="${meta.height}" alt="${meta.alt}">`;
}

function counted(prefix: string, count?: number): string {
  if (count === undefined) return prefix;
  return count > MAX_COUNT ? `${prefix}-many` : `${prefix}-${count}`;
}

export function sevBadge(severity: Severity, count?: number): string {
  return badge(counted(`sev-${severity}`, count));
}

export function statusBadge(kind: StatusKind, count?: number): string {
  return badge(kind === "learned" ? "status-learned" : counted(`status-${kind}`, count));
}

export function priorityBadge(priority: Priority): string {
  return badge(`priority-${priority}`);
}

export function riskBadge(risk: RiskLevel): string {
  return badge(`risk-${risk}`);
}

/** Badges for a finding's reviewers (`general+security`), at most two. */
export function reviewerBadges(badgeIds: string[]): string[] {
  return badgeIds.slice(0, 2).map((id) => badge(`rev-${id}`));
}

/** Badges side by side; text labels are separated so they stay readable. */
export function row(parts: string[]): string {
  return parts.filter(Boolean).join(images() ? " " : " · ");
}

/** A badge that links somewhere: an image link, or a plain markdown link when images are off. */
export function button(name: "button-review" | "button-finding", url: string): string {
  const meta = manifest[name];
  if (!meta || !images()) return `[${meta?.alt ?? "Open in PR Guard"}](${url})`;
  return `<a href="${url}">${badge(name)}</a>`;
}
