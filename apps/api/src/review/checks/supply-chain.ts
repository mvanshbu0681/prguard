import { lookup, socketEnabled, type SocketPackage } from "../../integrations/socket.ts";
import { errMessage, log } from "../../log.ts";
import type { RawFinding } from "../findings.ts";
import { defineCheck } from "../reviewers/define.ts";
import type { Severity } from "../types.ts";
import { dependencies, isManifest, purl, type Dependency } from "./manifests.ts";

const CVE_SEVERITY: Record<string, Severity> = { criticalCVE: "critical", cve: "high", mediumCVE: "medium", mildCVE: "low" };
const RANK: Severity[] = ["critical", "high", "medium", "low", "nit"];
const MALWARE = new Set(["malware", "gptMalware", "troll"]);

function words(type: string): string {
  return type
    .replace(/^gpt/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/CVE/g, " CVE")
    .trim()
    .toLowerCase();
}

function socketUrl(pkg: Pick<Dependency, "ecosystem" | "name" | "version">): string {
  if (pkg.ecosystem === "golang") return `https://socket.dev/go/package/${pkg.name}?section=overview&version=${encodeURIComponent(pkg.version)}`;
  return `https://socket.dev/${pkg.ecosystem}/package/${pkg.name}/overview/${encodeURIComponent(pkg.version)}`;
}

/** Socket's own verdict decides: `error` is Critical, `warn` High, otherwise CVEs by their type. */
function assess(pkg: SocketPackage): { severity: Severity; malware: boolean; blocking: SocketPackage["alerts"]; cves: SocketPackage["alerts"] } | null {
  const alerts = pkg.alerts.filter((a) => a.action !== "ignore");
  const blocking = alerts.filter((a) => a.action === "error" || a.action === "warn");
  const cves = alerts.filter((a) => a.type in CVE_SEVERITY);
  const malware = blocking.some((a) => MALWARE.has(a.type));
  if (blocking.some((a) => a.action === "error")) return { severity: "critical", malware, blocking, cves };
  if (blocking.length) return { severity: "high", malware, blocking, cves };
  if (!cves.length) return null;
  const worst = cves.map((a) => CVE_SEVERITY[a.type]!).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0]!;
  return { severity: worst, malware: false, blocking, cves };
}

function patched(cves: SocketPackage["alerts"]): string | null {
  for (const a of cves) {
    const v = a.props.firstPatchedVersionIdentifier;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

function finding(dep: Dependency, pkg: SocketPackage): RawFinding | null {
  const verdict = assess(pkg);
  if (!verdict) return null;
  const id = `\`${dep.name}@${dep.version}\``;
  const score = pkg.supplyChain === null ? "" : ` (supply-chain score ${Math.round(pkg.supplyChain * 100)})`;
  let title: string;
  let body: string;
  if (verdict.malware) {
    title = `${id} is known malware`;
    body = `Socket flags this version as malware${score}. Remove it before anyone installs dependencies on this branch.`;
  } else if (verdict.blocking.length) {
    title = `${id}: ${words(verdict.blocking[0]!.type)}`;
    body = `Socket reports ${verdict.blocking.map((a) => words(a.type)).join(", ")} for this version${score}. Check the package before merging.`;
  } else {
    const fix = patched(verdict.cves);
    title = `${id} has ${verdict.cves.length} known vulnerabilit${verdict.cves.length === 1 ? "y" : "ies"}`;
    body = `Socket lists ${verdict.cves.length} known vulnerabilit${verdict.cves.length === 1 ? "y" : "ies"} for this version, the worst rated ${verdict.severity}. ${fix ? `Upgrade to at least \`${fix}\`.` : "Upgrade to a patched version."}`;
  }
  const listed = [...verdict.blocking, ...verdict.cves.filter((c) => !verdict.blocking.includes(c))].slice(0, 12);
  const details = listed.map((a) => `- ${words(a.type)}: ${a.severity}${a.action ? `, ${a.action}` : ""}`);
  if (pkg.supplyChain !== null) details.push(`- supply-chain score: ${Math.round(pkg.supplyChain * 100)}`);
  return {
    reviewer: "supply-chain",
    path: dep.path,
    line: dep.line,
    severity: verdict.severity,
    category: "supply-chain",
    title,
    body: `${body} [View on Socket](${socketUrl(dep)})`,
    confidence: 1,
    suggestion: null,
    details: { title: "What Socket found", body: details.join("\n") },
  };
}

export default defineCheck({
  id: "supply-chain",
  name: "Supply chain",
  description: "Malicious and vulnerable dependencies, checked with Socket.",
  badge: "supply-chain",
  appliesTo: isManifest,
  async run({ files, snapshot }) {
    const deps = dependencies(files, snapshot);
    if (deps.length === 0) return { findings: [], detail: "No dependency changes" };
    if (!socketEnabled()) return { findings: [], detail: "Skipped, no Socket key" };
    let packages: SocketPackage[];
    try {
      packages = await lookup(deps.map(purl));
    } catch (err) {
      log.warn({ err: errMessage(err), packages: deps.length }, "socket lookup failed");
      return { findings: [], detail: "Skipped, Socket unavailable" };
    }
    const byKey = new Map(packages.map((p) => [`${p.ecosystem}:${p.name.toLowerCase()}@${p.version}`, p]));
    const findings = deps.flatMap((dep) => {
      const pkg = byKey.get(`${dep.ecosystem}:${dep.name.toLowerCase()}@${dep.version}`);
      const f = pkg ? finding(dep, pkg) : null;
      return f ? [f] : [];
    });
    return { findings, detail: `${deps.length} packages, ${findings.length} flagged` };
  },
});
