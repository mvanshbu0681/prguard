import { cookies } from "next/headers";

export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number };

function apiBase(): string {
  return (process.env.API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}

// Server-side call to the backend, carrying the visitor's session cookie.
// status 0 means the backend could not be reached.
export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  // Read cookies outside the try: it marks the route dynamic and must not be swallowed.
  const cookie = (await cookies()).toString();

  try {
    const res = await fetch(`${apiBase()}/api${path}`, {
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}
