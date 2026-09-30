import { Hono } from "hono";
import { registerWebhookRoute } from "../github/webhooks.ts";
import { log } from "../log.ts";
import { auth } from "./routes/auth.ts";
import { insights } from "./routes/insights.ts";
import { installations } from "./routes/installations.ts";
import { queue } from "./routes/queue.ts";
import { me } from "./routes/me.ts";
import { repos } from "./routes/repos.ts";
import { reviewers } from "./routes/reviewers.ts";
import { reviews } from "./routes/reviews.ts";

export function createServer(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));
  registerWebhookRoute(app);
  app.route("/api/auth", auth);
  app.route("/api/me", me);
  app.route("/api/repos", repos);
  app.route("/api/reviews", reviews);
  app.route("/api/installations", installations);
  app.route("/api/reviewers", reviewers);
  app.route("/api/queue", queue);
  app.route("/api/insights", insights);

  app.onError((err, c) => {
    log.error({ err, path: c.req.path }, "request failed");
    return c.json({ error: "Something went wrong." }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found." }, 404));

  return app;
}
