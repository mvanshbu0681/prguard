import { and, eq, inArray } from "drizzle-orm";
import { db } from "../client.ts";
import { pullRequests, type PullRequest } from "../schema.ts";

export type PullInput = {
  repositoryId: number;
  number: number;
  title: string;
  body: string | null;
  authorLogin: string;
  authorAvatar: string | null;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  headSha: string;
  baseSha: string | null;
  baseRef: string | null;
  headRef: string | null;
  labels: string[];
};

export function upsert(input: PullInput): PullRequest {
  const now = Date.now();
  const { repositoryId, number, ...rest } = input;
  return db
    .insert(pullRequests)
    .values({ ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [pullRequests.repositoryId, pullRequests.number], set: { ...rest, updatedAt: now } })
    .returning()
    .get();
}

export function get(id: number): PullRequest | undefined {
  return db.select().from(pullRequests).where(eq(pullRequests.id, id)).get();
}

export function getMany(ids: number[]): Map<number, PullRequest> {
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(pullRequests)
      .where(inArray(pullRequests.id, ids))
      .all()
      .map((p) => [p.id, p]),
  );
}

export function getByNumber(repositoryId: number, number: number): PullRequest | undefined {
  return db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.number, number)))
    .get();
}

export function update(id: number, patch: Partial<Omit<PullRequest, "id" | "repositoryId" | "number" | "createdAt">>): void {
  db.update(pullRequests).set({ ...patch, updatedAt: Date.now() }).where(eq(pullRequests.id, id)).run();
}
