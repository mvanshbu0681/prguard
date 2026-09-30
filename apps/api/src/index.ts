import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { migrateDb } from "./db/client.ts";
import * as deliveriesRepo from "./db/repos/deliveries.ts";
import { reconcile } from "./github/reconcile.ts";
import { startRelay } from "./github/relay.ts";
import { createServer } from "./http/server.ts";
import { errMessage, log } from "./log.ts";
import { startWorkers } from "./queue/worker.ts";
import "./brief/index-repo.ts";
import "./review/events.ts";
import "./review/run.ts";
import "./commands/events.ts";
import "./commands/run.ts";
import "./commands/answer.ts";

async function main(): Promise<void> {
  migrateDb();

  if (config.role !== "worker") {
    const app = createServer();
    serve({ fetch: app.fetch, port: config.port }, (info) => log.info({ port: info.port, role: config.role }, "api listening"));
    startRelay().catch((err) => log.error({ err: errMessage(err) }, "webhook relay failed"));
    reconcile().catch((err) => log.error({ err: errMessage(err) }, "reconcile failed"));
    // Delivery ids only need to outlive GitHub's redelivery window.
    setInterval(() => deliveriesRepo.prune(14 * 86_400_000), 6 * 3_600_000).unref();
  }

  if (config.role !== "api") startWorkers(config.workerConcurrency);
}

main().catch((err) => {
  log.fatal({ err }, "boot failed");
  process.exit(1);
});
