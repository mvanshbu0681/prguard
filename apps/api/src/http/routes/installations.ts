import { Hono } from "hono";
import { z } from "zod";
import * as installationsRepo from "../../db/repos/installations.ts";
import { requireUser, type AuthEnv } from "../session.ts";

const patchSchema = z.object({ rules: z.string().max(10_000) });

export const installations = new Hono<AuthEnv>();

installations.use("*", requireUser);

installations.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!c.get("installationIds").includes(id)) return c.json({ error: "Organization not found." }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request." }, 400);
  installationsRepo.setRules(id, parsed.data.rules);
  return c.json({ ok: true });
});
