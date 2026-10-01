import { SocketSdk } from "@socketsecurity/sdk";
import { config } from "../config.ts";

export type SocketAlert = { type: string; severity: string; action: string | null; props: Record<string, unknown> };

export type SocketPackage = {
  ecosystem: string;
  name: string;
  version: string;
  supplyChain: number | null;
  alerts: SocketAlert[];
};

let client: SocketSdk | null = null;

export function socketEnabled(): boolean {
  return Boolean(config.socketApiKey);
}

function sdk(): SocketSdk {
  client ??= new SocketSdk(config.socketApiKey!, { timeout: 30_000, retries: 2 });
  return client;
}

type RawArtifact = {
  type?: string;
  namespace?: string;
  name?: string;
  version?: string;
  score?: { supplyChain?: number };
  alerts?: { type?: string; severity?: string; action?: string; props?: Record<string, unknown> }[];
};

/** The response is a list of artifacts, or newline-delimited JSON of them, depending on the SDK path. */
function artifacts(data: unknown): RawArtifact[] {
  if (Array.isArray(data)) return data as RawArtifact[];
  if (typeof data === "string") {
    return data
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as RawArtifact];
        } catch {
          return [];
        }
      });
  }
  return data && typeof data === "object" ? [data as RawArtifact] : [];
}

/**
 * Socket's analysis of each package version, by PURL. Artifacts of one version (a wheel and an sdist,
 * say) are merged. Packages Socket does not know are simply absent. Throws when Socket fails.
 */
export async function lookup(purls: string[]): Promise<SocketPackage[]> {
  if (purls.length === 0) return [];
  const res = await sdk().batchPackageFetch({ components: purls.map((purl) => ({ purl })) }, { alerts: "true" });
  if (!res.success) throw new Error(`Socket lookup failed (${res.status})`);

  const merged = new Map<string, SocketPackage>();
  for (const a of artifacts(res.data)) {
    if (!a.name || !a.version || !a.type) continue;
    const name = a.namespace ? `${a.namespace}/${a.name}` : a.name;
    const key = `${a.type}:${name}@${a.version}`;
    const pkg = merged.get(key) ?? { ecosystem: a.type, name, version: a.version, supplyChain: null, alerts: [] };
    if (typeof a.score?.supplyChain === "number") pkg.supplyChain = Math.min(pkg.supplyChain ?? 1, a.score.supplyChain);
    for (const alert of a.alerts ?? []) {
      if (!alert.type) continue;
      if (pkg.alerts.some((x) => x.type === alert.type && x.action === (alert.action ?? null))) continue;
      pkg.alerts.push({ type: alert.type, severity: alert.severity ?? "low", action: alert.action ?? null, props: alert.props ?? {} });
    }
    merged.set(key, pkg);
  }
  return [...merged.values()];
}
