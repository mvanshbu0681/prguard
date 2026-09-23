// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// hey-api's runtime configuration hook (openapi-ts.config.ts → runtimeConfigPath).
// The generated src/api/client.gen.ts calls createClientConfig() while it creates
// the client singleton, so every consumer — a hook, a test, a server component —
// gets a client that already points at API_BASE and already sends through the
// transport (the fixture resolver in fixture mode). Nothing has to "install" it
// before the first request.
import { API_BASE } from "@/lib/env";
import type { CreateClientConfig } from "./client.gen";
import { apiTransport } from "./transport";

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: API_BASE,
  fetch: apiTransport,
});
