import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { migrateDb } from "./db/client.ts";
import { createServer } from "./http/server.ts";
import { log } from "./log.ts";

async function main(): Promise<void> {
  migrateDb();

  const app = createServer();
  serve({ fetch: app.fetch, port: config.port }, (info) => log.info({ port: info.port, role: config.role }, "api listening"));
}

main().catch((err) => {
  log.fatal({ err }, "boot failed");
  process.exit(1);
});
