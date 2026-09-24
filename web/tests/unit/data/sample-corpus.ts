// OWNER: t2a (wave 1). Test helpers over the inline sample corpus
// (src/lib/fixture-sample.ts, shared with /lab/t2a?corpus=sample), so the tests
// do not depend on whether t2b's generated corpus or the stubs are on disk.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { createFixtureResolver, FixtureMissingError, type FixtureResolverOptions } from "@/lib/fixture-resolver";
import { sampleFiles, type CorpusFiles } from "@/lib/fixture-sample";

export * from "@/lib/fixture-sample";

export const API = "http://localhost:8000";

export function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

export interface TestResolverOptions extends Omit<FixtureResolverOptions, "load"> {
  files?: CorpusFiles;
  search?: string;
}

/** A resolver over the sample corpus: no latency, memory storage, a settable page URL. */
export function testResolver(options: TestResolverOptions = {}) {
  const files = options.files ?? sampleFiles();
  const loads: string[] = [];
  const page = { search: options.search ?? "" };
  const resolver = createFixtureResolver({
    latency: 0,
    storage: memoryStorage(),
    hasher: null,
    ...options,
    pageParams: options.pageParams ?? (() => new URLSearchParams(page.search)),
    load: async (path) => {
      loads.push(path);
      if (!(path in files)) throw new FixtureMissingError(path);
      return files[path]!;
    },
  });
  return { resolver, loads, page, files };
}

/** fetch a route through a resolver: `call(r, "GET", "/v1/findings?limit=2")`. */
export async function call(
  resolver: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  // Tests read arbitrary paths off the body; the resolver's shapes are asserted, not assumed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res = await resolver(new Request(`${API}${path}`, init));
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

export function queryWrapper(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
  // TanStack re-renders a hook only for the result properties read during
  // render. renderHook tests read them afterwards, in assertions, so opt out of
  // tracking here — otherwise result.current can be a stale render.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, notifyOnChangeProps: "all" } });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { queryClient, Wrapper };
}
