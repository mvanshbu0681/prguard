import type { Role } from "../../llm/models.ts";

/**
 * A reviewer is one focused pass over each chunk of a pull request. Add a reviewer by writing a file
 * that default-exports `defineReviewer({...})` and listing it in `index.ts`.
 */
export type Reviewer = {
  id: string;
  name: string;
  description: string;
  /** Which model role runs it: `fast` or `smart`. */
  role: Role;
  /** Whether it may read and search the repository while reviewing. */
  tools: boolean;
  /** What this reviewer looks for. Output format and line rules are added for you. */
  instructions: string;
  /** Tool-loop steps before it must answer. */
  maxSteps?: number;
};

export function defineReviewer(reviewer: Reviewer): Reviewer {
  return reviewer;
}
