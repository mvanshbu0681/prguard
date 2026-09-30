import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../client.ts";
import { repositories, type Repository } from "../schema.ts";

export type RepositoryInput = {
  id: number;
  fullName: string;
  defaultBranch?: string | null;
  private?: boolean;
};

export function upsertMany(installationId: number, repos: RepositoryInput[]): void {
  const now = Date.now();
  db.transaction((tx) => {
    for (const repo of repos) {
      const values = {
        installationId,
        fullName: repo.fullName,
        private: repo.private ?? false,
        removedAt: null,
        updatedAt: now,
        ...(repo.defaultBranch ? { defaultBranch: repo.defaultBranch } : {}),
      };
      tx.insert(repositories)
        .values({ id: repo.id, ...values, createdAt: now })
        .onConflictDoUpdate({ target: repositories.id, set: values })
        .run();
    }
  });
}

export function get(id: number): Repository | undefined {
  return db.select().from(repositories).where(eq(repositories.id, id)).get();
}

export function listActive(installationIds?: number[]): Repository[] {
  const conditions = [isNull(repositories.removedAt)];
  if (installationIds) conditions.push(inArray(repositories.installationId, installationIds.length ? installationIds : [-1]));
  return db
    .select()
    .from(repositories)
    .where(and(...conditions))
    .orderBy(repositories.fullName)
    .all();
}

export function markRemoved(ids: number[]): void {
  if (ids.length === 0) return;
  db.update(repositories).set({ removedAt: Date.now(), updatedAt: Date.now() }).where(inArray(repositories.id, ids)).run();
}

export function markRemovedExcept(installationId: number, keepIds: number[]): number[] {
  const gone = db
    .select({ id: repositories.id })
    .from(repositories)
    .where(
      and(
        eq(repositories.installationId, installationId),
        isNull(repositories.removedAt),
        notInArray(repositories.id, keepIds.length ? keepIds : [-1]),
      ),
    )
    .all()
    .map((r) => r.id);
  markRemoved(gone);
  return gone;
}

export function markRemovedForInstallation(installationId: number): number[] {
  return markRemovedExcept(installationId, []);
}

export function update(
  id: number,
  patch: Partial<Pick<Repository, "enabled" | "rules" | "disabledReviewers" | "brief" | "briefStatus" | "briefSha" | "briefUpdatedAt" | "defaultBranch">>,
): void {
  db.update(repositories).set({ ...patch, updatedAt: Date.now() }).where(eq(repositories.id, id)).run();
}
