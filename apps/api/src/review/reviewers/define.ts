import type { Repository } from "../../db/schema.ts";
import type { Role } from "../../llm/models.ts";
import type { FileDiff } from "../diff.ts";
import type { RawFinding } from "../findings.ts";
import { fileKind, type FileKind } from "../noise.ts";

/** The files a plugin looks at: file kinds, or a test on the path. */
export type Applies = FileKind[] | ((path: string) => boolean);

type Base = {
  id: string;
  name: string;
  description: string;
  /** Reviewer badge shown on its findings (`rev-<badge>`). */
  badge: string;
  appliesTo: Applies;
};

/**
 * A model reviewer is one focused pass over the files routed to it. Add one by writing a file that
 * default-exports `defineReviewer({...})` and listing it in `index.ts`.
 */
export type ModelReviewer = Base & {
  kind: "model";
  /** Which model role runs it: `fast` or `smart`. */
  role: Role;
  /** Whether it may read and search the repository while reviewing. */
  tools: boolean;
  /** What this reviewer looks for. Output format and line rules are added for you. */
  instructions: string;
  /** Tool-loop steps before it must answer. */
  maxSteps?: number;
  needs?: {
    /** Callers of changed code in the prompt; `required` skips the reviewer when there are none. */
    impact?: "optional" | "required";
    /** Team rules and learnings in the prompt; skipped when there are none and no brief. */
    rules?: boolean;
    /** Runs only when the repository has test files. */
    testsInRepo?: boolean;
  };
};

export type CheckInput = {
  files: FileDiff[];
  snapshot: string | null;
  repo: Repository;
  signal?: AbortSignal;
};

/** A check is code, not a model: it reads the diff (and snapshot) and returns findings. */
export type Check = Base & {
  kind: "check";
  run(input: CheckInput): Promise<{ findings: RawFinding[]; detail: string }>;
};

export type Plugin = ModelReviewer | Check;

export function defineReviewer(reviewer: Omit<ModelReviewer, "kind">): ModelReviewer {
  return { kind: "model", ...reviewer };
}

export function defineCheck(check: Omit<Check, "kind">): Check {
  return { kind: "check", ...check };
}

export function applies(plugin: Plugin, path: string): boolean {
  return Array.isArray(plugin.appliesTo) ? plugin.appliesTo.includes(fileKind(path)) : plugin.appliesTo(path);
}
