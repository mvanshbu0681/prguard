import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../client.ts";
import { installations, type Installation } from "../schema.ts";

export type InstallationInput = {
  id: number;
  accountLogin: string;
  accountType: string;
  avatarUrl?: string | null;
  repositorySelection?: string | null;
  suspended?: boolean;
};

export function upsert(input: InstallationInput): void {
  const now = Date.now();
  const values = {
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    avatarUrl: input.avatarUrl ?? null,
    repositorySelection: input.repositorySelection ?? null,
    suspended: input.suspended ?? false,
    deletedAt: null,
    updatedAt: now,
  };
  db.insert(installations)
    .values({ id: input.id, ...values, createdAt: now })
    .onConflictDoUpdate({ target: installations.id, set: values })
    .run();
}

export function get(id: number): Installation | undefined {
  return db.select().from(installations).where(eq(installations.id, id)).get();
}

export function listActive(): Installation[] {
  return db.select().from(installations).where(isNull(installations.deletedAt)).all();
}

export function listByIds(ids: number[]): Installation[] {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(installations)
    .where(and(inArray(installations.id, ids), isNull(installations.deletedAt)))
    .all();
}

export function markDeleted(id: number): void {
  db.update(installations).set({ deletedAt: Date.now(), updatedAt: Date.now() }).where(eq(installations.id, id)).run();
}

export function markDeletedExcept(keepIds: number[]): number[] {
  const gone = db
    .select({ id: installations.id })
    .from(installations)
    .where(and(isNull(installations.deletedAt), notInArray(installations.id, keepIds.length ? keepIds : [-1])))
    .all()
    .map((r) => r.id);
  for (const id of gone) markDeleted(id);
  return gone;
}

export function setSuspended(id: number, suspended: boolean): void {
  db.update(installations).set({ suspended, updatedAt: Date.now() }).where(eq(installations.id, id)).run();
}

export function setRules(id: number, rules: string): void {
  db.update(installations).set({ rules, updatedAt: Date.now() }).where(eq(installations.id, id)).run();
}
