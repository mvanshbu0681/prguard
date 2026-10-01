// Browser-side fetch helper. Everything goes through the same-origin /api proxy
// so the session cookie never leaves this origin.

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiInit = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const hasBody = body !== undefined;

  const res = await fetch(`/api${path}`, {
    // Always the live answer: a copy the browser stored earlier (e.g. under a CDN's max-age) can be stale.
    cache: "no-store",
    ...rest,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.location.href = "/login";
    // Leave the caller pending while the browser navigates away.
    return new Promise<T>(() => {});
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed.";
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
