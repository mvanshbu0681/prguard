import { Hono } from "hono";
import { registerWebhookRoute } from "../github/webhooks.ts";
import { log } from "../log.ts";

export function createServer(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));
  registerWebhookRoute(app);

  app.onError((err, c) => {
    log.error({ err, path: c.req.path }, "request failed");
    return c.json({ error: "Something went wrong." }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found." }, 404));

  return app;
}
