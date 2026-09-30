import { lt } from "drizzle-orm";
import { db } from "../client.ts";
import { webhookDeliveries } from "../schema.ts";

/** Records a delivery; false when it was already seen. */
export function record(id: string, event: string, action: string | null): boolean {
  const result = db
    .insert(webhookDeliveries)
    .values({ id, event, action, receivedAt: Date.now() })
    .onConflictDoNothing()
    .run();
  return result.changes > 0;
}

export function prune(olderThanMs: number): void {
  db.delete(webhookDeliveries).where(lt(webhookDeliveries.receivedAt, Date.now() - olderThanMs)).run();
}
