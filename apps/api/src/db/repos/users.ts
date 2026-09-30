import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../client.ts";
import { sessions, userInstallations, users, type User } from "../schema.ts";

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

export function setInstallations(userId: number, installationIds: number[]): void {
  db.transaction((tx) => {
    tx.delete(userInstallations).where(eq(userInstallations.userId, userId)).run();
    for (const installationId of installationIds) tx.insert(userInstallations).values({ userId, installationId }).onConflictDoNothing().run();
  });
}

export function addInstallation(userId: number, installationId: number): void {
  db.insert(userInstallations).values({ userId, installationId }).onConflictDoNothing().run();
}

export function installationIds(userId: number): number[] {
  return db
    .select({ id: userInstallations.installationId })
    .from(userInstallations)
    .where(eq(userInstallations.userId, userId))
    .all()
    .map((r) => r.id);
}
