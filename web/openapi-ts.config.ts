// OWNER: t2a (wave 1).
//
// `npm run api:gen` regenerates the typed client in src/api from the COMMITTED
// OpenAPI document (web/openapi/openapi.json, extracted from the backend at
// eeb1be8, plan A2). Never a live URL: builds are offline. The output is
// committed; `npm run api:check` regenerates into a temp directory with this same
// config and fails on any difference.
//
// Three deliberate choices:
//  1. output.clean is false. src/api also holds hand-written modules (ext.ts, the
//     transport, the runtime config); a clean run would delete them. Stale
//     generated files cannot hide: api:check reports any file that carries the
//     generator header but is no longer produced.
//  2. FastAPI's default operationIds (`list_findings_v1_findings_get`) are cut
//     back to the route function name (`list_findings`) in memory, so the client
//     reads `listFindings`, `listFindingsQueryKey`, `suppressFindingMutation`.
//     FastAPI builds the id as re.sub(r"\W", "_", name + path) + "_" + method;
//     the suffix removed below is exactly that path + method part. The
//     committed openapi.json is not modified.
//  3. runtimeConfigPath is a bare specifier, so the import in client.gen.ts is
//     identical wherever the output is written (api:check depends on that). The
//     runtime config points the client at API_BASE and, in fixture mode, at the
//     fixture resolver.
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  // The "./" matters: a bare "openapi/openapi.json" parses as a Hey API
  // registry shorthand (organization/project) and the run fails.
  input: "./openapi/openapi.json",
  output: {
    path: "src/api",
    clean: false,
    // No generated src/api/index.ts: components import shapes from
    // @/lib/api-types and the data layer imports the generated modules by name.
    entryFile: false,
  },
  parser: {
    patch: {
      operations: (method, path, operation) => {
        const suffix = `${path.replace(/\W/g, "_")}_${method.toLowerCase()}`;
        if (operation.operationId?.endsWith(suffix) && operation.operationId.length > suffix.length) {
          operation.operationId = operation.operationId.slice(0, -suffix.length);
        }
      },
    },
  },
  plugins: [
    { name: "@hey-api/client-fetch", runtimeConfigPath: "@/api/runtime-config" },
    "@hey-api/typescript",
    "@hey-api/sdk",
    {
      name: "@tanstack/react-query",
      queryOptions: true,
      queryKeys: true,
      infiniteQueryOptions: true,
      infiniteQueryKeys: true,
      mutationOptions: true,
    },
  ],
});
