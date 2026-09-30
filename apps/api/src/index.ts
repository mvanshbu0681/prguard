import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { migrateDb } from "./db/client.ts";
import { reconcile } from "./github/reconcile.ts";
import { startRelay } from "./github/relay.ts";
import { createServer } from "./http/server.ts";
import { errMessage, log } from "./log.ts";

async function main(): Promise<void> {
  migrateDb();

  const app = createServer();
  serve({ fetch: app.fetch, port: config.port }, (info) => log.info({ port: info.port, role: config.role }, "api listening"));

  startRelay().catch((err) => log.error({ err: errMessage(err) }, "webhook relay failed"));
  reconcile().catch((err) => log.error({ err: errMessage(err) }, "reconcile failed"));
}

main().catch((err) => {
  log.fatal({ err }, "boot failed");
  process.exit(1);
});
