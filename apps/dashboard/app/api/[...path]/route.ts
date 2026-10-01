import type { NextRequest } from "next/server";

// Runtime proxy to the backend. The browser only ever talks to this origin, so the
// session cookie the backend sets is first-party here.

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

// Hop-by-hop headers must not be forwarded (and undici rejects some of them).
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "content-length",
]);

// fetch() already decoded the body, so the original framing headers no longer apply.
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

async function proxy(req: NextRequest, { params }: Context): Promise<Response> {
  const { path } = await params;
  const base = (process.env.API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  const target = `${base}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key)) headers.set(key, value);
  });
  headers.set("x-forwarded-host", req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  headers.set("x-forwarded-proto", req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, ""));

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Service unavailable." }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key === "set-cookie" || DROP_RESPONSE.has(key)) return;
    out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  // Answers carry the visitor's own data: a CDN in front must never store or share them.
  out.set("cache-control", "private, no-store");

  const bodyless = method === "HEAD" || upstream.status === 204 || upstream.status === 304;
  return new Response(bodyless ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
