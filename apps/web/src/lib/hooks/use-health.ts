// OWNER: t2a (wave 1).
//
// GET /healthz and GET /readyz (spec §6.11). /settings/integrations polls both
// at 30s (dashboard §2.12); pass refetchInterval to do the same.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { healthzQueryKey, readyzQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ApiError } from "@/api/errors";
import { healthz, readyz } from "@/api/sdk.gen";
import type { HealthResponse, ReadyResponse } from "@/lib/api-types";
import { unwrap } from "./internal";

export function useHealthz(options: { enabled?: boolean; refetchInterval?: number | false } = {}): UseQueryResult<HealthResponse, ApiError> {
  return useQuery<HealthResponse, ApiError, HealthResponse, ReturnType<typeof healthzQueryKey>>({
    queryKey: healthzQueryKey(),
    queryFn: ({ signal }) => unwrap(healthz({ signal, throwOnError: true }), { method: "GET", path: "/healthz" }),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}

export function useReadyz(options: { enabled?: boolean; refetchInterval?: number | false } = {}): UseQueryResult<ReadyResponse, ApiError> {
  return useQuery<ReadyResponse, ApiError, ReadyResponse, ReturnType<typeof readyzQueryKey>>({
    queryKey: readyzQueryKey(),
    queryFn: ({ signal }) => unwrap(readyz({ signal, throwOnError: true }), { method: "GET", path: "/readyz" }),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}
