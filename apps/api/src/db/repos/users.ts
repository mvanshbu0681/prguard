import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../client.ts";
import { sessions, userInstallations, userRepositories, users, type User } from "../schema.ts";

export function upsert(input: { githubId: number; login: string; name: string | null; avatarUrl: string | null }): User {
  const now = Date.now();
  return db
    .insert(users)
    .values({ ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: users.githubId, set: { login: input.login, name: input.name, avatarUrl: input.avatarUrl, updatedAt: now } })
    .returning()
    .get();
}

export function get(id: number): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function getByGithubId(githubId: number): User | undefined {
  return db.select().from(users).where(eq(users.githubId, githubId)).get();
}

export function createSession(userId: number, days: number): { id: string; expiresAt: number } {
  const id = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + days * 86_400_000;
  db.insert(sessions).values({ id, userId, expiresAt, createdAt: Date.now() }).run();
  db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
  return { id, expiresAt };
}

export function sessionUser(sessionId: string): User | undefined {
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, Date.now())))
    .get();
  return row?.user;
}

export function deleteSession(sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export type Access = {
  installations: { installationId: number; admin: boolean }[];
  repositories: { repositoryId: number; admin: boolean }[];
};

/** Replaces what a user can see with what GitHub reported at sign-in. */
export function setAccess(userId: number, access: Access): void {
  db.transaction((tx) => {
    tx.delete(userInstallations).where(eq(userInstallations.userId, userId)).run();
    tx.delete(userRepositories).where(eq(userRepositories.userId, userId)).run();
    for (const i of access.installations) tx.insert(userInstallations).values({ userId, ...i }).onConflictDoNothing().run();
    for (const r of access.repositories) tx.insert(userRepositories).values({ userId, ...r }).onConflictDoNothing().run();
  });
}

/** The installer of a new installation administers it until their next sign-in refreshes access. */
export function addInstallation(userId: number, installationId: number, admin: boolean): void {
  db.insert(userInstallations)
    .values({ userId, installationId, admin })
    .onConflictDoUpdate({ target: [userInstallations.userId, userInstallations.installationId], set: { admin } })
    .run();
}

export function access(userId: number): Access {
  return {
    installations: db
      .select({ installationId: userInstallations.installationId, admin: userInstallations.admin })
      .from(userInstallations)
      .where(eq(userInstallations.userId, userId))
      .all(),
    repositories: db
      .select({ repositoryId: userRepositories.repositoryId, admin: userRepositories.admin })
      .from(userRepositories)
      .where(eq(userRepositories.userId, userId))
      .all(),
  };
}
