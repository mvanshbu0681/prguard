// OWNER: t2b. The fixture corpus (web/public/fixtures), checked against the brief and against
// itself. The generator asserts the same things in Python before it writes a byte; this is
// the TypeScript side's independent reading of the files it actually ships.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEVERITY_INPUTS, STAGES } from "@/lib/contracts";
import type { DeliveryMode, FindingStatus, GateConclusion, ProofStatus } from "@/lib/contracts";
import { canonical, eventHash, hashedDocument, Lexeme, parseLossless } from "./lossless-json";
import type { Lossless } from "./lossless-json";

const ROOT = path.resolve(import.meta.dirname, "../../../public/fixtures");
const raw = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture JSON, shapes checked below
const load = (file: string): any => JSON.parse(raw(file));

/** Every value of each contract union. `satisfies` + the `Exact` check keep the lists exhaustive. */
type Exact<T, L extends readonly T[]> = [T] extends [L[number]] ? L : never;
const PROOF_STATUSES = ["proven", "disproven", "inconclusive", "not_attempted", "not_applicable", "skipped_no_env"] as const satisfies readonly ProofStatus[];
const DELIVERY_MODES = ["inline_exact", "inline_nearest", "file_level", "summary_only", "not_delivered"] as const satisfies readonly DeliveryMode[];
const GATE_CONCLUSIONS = ["failure", "neutral", "success"] as const satisfies readonly GateConclusion[];
const FINDING_STATUSES = ["proposed", "published", "suppressed", "dropped", "disproven"] as const satisfies readonly FindingStatus[];
const exhaustive: [
  Exact<ProofStatus, typeof PROOF_STATUSES>,
  Exact<DeliveryMode, typeof DELIVERY_MODES>,
  Exact<GateConclusion, typeof GATE_CONCLUSIONS>,
  Exact<FindingStatus, typeof FINDING_STATUSES>,
] = [PROOF_STATUSES, DELIVERY_MODES, GATE_CONCLUSIONS, FINDING_STATUSES];

const BINDING_IDS = {
  tenant_id: "7f3c9a21-5b8e-4d6f-9a0c-2e4b6d8f1a3c",
  demo_review_id: "4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41",
  proven_finding_id: "a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d",
  disproven_finding_id: "5d20b7f4-9c1a-4e8b-a6d3-1f7e9b2c4a60",
  inconclusive_finding_id: "c83e61a9-2d4f-4b7a-9e05-6a1d3f8c2b97",
  base_sha: "7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19",
  head_sha: "9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92",
  repository: { owner: "acme", name: "checkout-service" },
  pr_number: 4821,
  repro_test_path: "tests/test_repro_7e3f1a.py",
  failing_test: "test_charge_uses_account_currency",
  tamper_demo_seq: 1428,
};

const HEAD_TAIL = [
  "E       AttributeError: 'NoneType' object has no attribute 'currency'",
  "tests/test_repro_7e3f1a.py:41: AttributeError",
  "1 failed in 0.39s",
];

const lastLines = (text: string | null | undefined, count: number) =>
  (text ?? "").split("\n").filter((line) => line.trim() !== "").slice(-count);

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return jsonFiles(full);
    return name.endsWith(".json") ? [path.relative(ROOT, full)] : [];
  });
}

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysDeep(item, out));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      keysDeep(child, out);
    }
  }
  return out;
}

const manifest = load("manifest.json");
const reviews = load("reviews/index.json").items;
const findings = load("findings/index.json").items;
const demo = load(`reviews/${BINDING_IDS.demo_review_id}.result.json`);
const demoStatus = load(`reviews/${BINDING_IDS.demo_review_id}.status.json`);
const byId = new Map(demo.findings.map((finding: { id: string }) => [finding.id, finding]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proven: any = byId.get(BINDING_IDS.proven_finding_id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const disproven: any = byId.get(BINDING_IDS.disproven_finding_id);
const report = load("accuracy/report.json");
const series = load("accuracy/series.json");

describe("fixture corpus: manifest and files", () => {
  it("has no stub markers left anywhere", () => {
    for (const file of jsonFiles(ROOT)) {
      const keys = keysDeep(load(file));
      expect(keys.has("_stub"), file).toBe(false);
      expect(keys.has("_owner"), file).toBe(false);
    }
  });

  it("keeps the binding ids verbatim and fills the counts", () => {
    expect(exhaustive).toHaveLength(4);
    expect(manifest.ids).toMatchObject(BINDING_IDS);
    expect(manifest.counts.findings).toBe(findings.length);
    expect(manifest.counts.runs).toBe(reviews.length);
    expect(manifest.counts.audit_events).toBe(load("audit/events.json").items.length);
    expect(manifest.generator.script).toBe("scripts/fixtures/gen_fixtures.py");
  });

  it("serves a status and a result file for every run in the index, and nothing else", () => {
    const expected = new Set<string>(["index.json"]);
    for (const item of reviews) {
      expected.add(`${item.review_id}.status.json`);
      expected.add(`${item.review_id}.result.json`);
    }
    expect(new Set(readdirSync(path.join(ROOT, "reviews")))).toEqual(expected);
    expect(existsSync(path.join(ROOT, load("live/demo-run.json").final_result_file))).toBe(true);
  });

  it("is sized as briefed: 240+ findings, six repositories, failed and cancelled runs", () => {
    expect(findings.length).toBeGreaterThanOrEqual(240);
    const repos = new Set(reviews.map((r: { repository: { owner: string; name: string } }) => `${r.repository.owner}/${r.repository.name}`));
    expect(repos.size).toBe(6);
    const statuses = reviews.map((r: { status: string }) => r.status);
    expect(statuses.filter((s: string) => s === "failed").length).toBeGreaterThanOrEqual(2);
    expect(statuses.filter((s: string) => s === "cancelled").length).toBeGreaterThanOrEqual(2);
    const published = findings.filter((f: { status: string }) => f.status === "published").length;
    expect(published / reviews.length).toBeGreaterThan(0.9);
    expect(published / reviews.length).toBeLessThan(1.5);
  });
});

describe("fixture corpus: every contract value appears", () => {
  const seen = (values: string[]) => new Set(values);
  it("ProofStatus", () => {
    const values = seen(findings.map((f: { proof: { status: string } }) => f.proof.status));
    for (const status of PROOF_STATUSES) expect(values, status).toContain(status);
  });
  it("DeliveryMode", () => {
    const values = seen(findings.map((f: { delivery: { mode: string } }) => f.delivery.mode));
    for (const mode of DELIVERY_MODES) expect(values, mode).toContain(mode);
  });
  it("FindingStatus", () => {
    const values = seen(findings.map((f: { status: string }) => f.status));
    for (const status of FINDING_STATUSES) expect(values, status).toContain(status);
  });
  it("GateConclusion", () => {
    const values = seen(reviews.map((r: { gate_conclusion: string | null }) => r.gate_conclusion ?? ""));
    for (const conclusion of GATE_CONCLUSIONS) expect(values, conclusion).toContain(conclusion);
  });
  it("every band and category among findings a human could see", () => {
    const visible = findings.filter((f: { status: string }) => f.status !== "dropped");
    const bands = seen(visible.map((f: { severity: { band: string } }) => f.severity.band));
    for (const band of ["critical", "high", "medium", "low", "info"]) expect(bands, band).toContain(band);
    const categories = seen(visible.map((f: { category: string }) => f.category));
    for (const category of ["correctness", "security", "test_integrity", "performance", "maintainability"]) {
      expect(categories, category).toContain(category);
    }
  });
});

describe("fixture corpus: the demo run", () => {
  it("is the briefed run on acme/checkout-service#4821", () => {
    expect(demo.status).toBe("succeeded");
    expect(demoStatus.status).toBe("succeeded");
    expect(demo.risk_tier).toBe("full");
    expect(demo.repository).toMatchObject(BINDING_IDS.repository);
    expect(demo.pull_request).toMatchObject({
      number: 4821,
      title: "Resolve account currency at charge time",
      base_sha: BINDING_IDS.base_sha,
      head_sha: BINDING_IDS.head_sha,
    });
    expect(demo.timing.duration_seconds).toBe(41.2);
    expect(demo.gate).toMatchObject({ conclusion: "failure", delivery: "commit_status", blocking_finding_ids: [BINDING_IDS.proven_finding_id] });
    expect(demo.delivery.event).toBe("COMMENT");
    expect(demo.delivery.ladder_breakdown.inline_nearest).toBeGreaterThanOrEqual(1);
    expect(demo.delivery.ladder_breakdown.file_level).toBeGreaterThanOrEqual(1);
  });

  it("has counts that agree with its own findings array and with brand-gaps §E", () => {
    const tally = (status: string) => demo.findings.filter((f: { status: string }) => f.status === status).length;
    expect(demo.findings).toHaveLength(12);
    expect(demo.counts).toMatchObject({
      proposed: 12,
      published: tally("published"),
      suppressed: tally("suppressed"),
      dropped: tally("dropped"),
      disproven: tally("disproven"),
      blocking: demo.findings.filter((f: { blocking: boolean }) => f.blocking).length,
    });
    expect([tally("published"), tally("suppressed"), tally("dropped"), tally("disproven")]).toEqual([3, 1, 7, 1]);
    const ladder = demo.delivery.ladder_breakdown;
    expect(ladder.inline_exact + ladder.inline_nearest + ladder.file_level + ladder.summary_only).toBe(tally("published"));
    for (const [label, count] of [
      ["raised", 12],
      ["dropped at the coordinator", 4],
      ["deduplicated", 3],
      ["suppressed by an existing rule", 1],
      ["disproven — refuted by execution", 1],
      ["inconclusive / not attempted", 2],
    ] as const) {
      expect(demo.review_payload.body).toContain(`| ${label} | ${count} |`);
    }
    expect(demo.review_payload.body).toContain("| **proven** | **1** |");
  });

  it("scores the proven finding 0.810 through the six weighted inputs", () => {
    const severity = proven.severity;
    expect(severity.score.toFixed(3)).toBe("0.810");
    expect(severity.band).toBe("critical");
    expect(severity.inputs).toEqual({ reachability: 1, blast_radius: 0.7, path_sensitivity: 1, coverage_gap: 0.5, churn: 0.3, proof_confidence: 1 });
    const sum = SEVERITY_INPUTS.reduce((total, name) => total + severity.weights[name] * severity.inputs[name], 0);
    expect(Math.abs(sum - 0.81)).toBeLessThan(0.0005);
    expect(Object.values(severity.weights).reduce((a: number, b) => a + (b as number), 0)).toBeCloseTo(1, 9);
  });

  it("carries the binding proof strings", () => {
    expect(demo.findings[0].id).toBe(BINDING_IDS.proven_finding_id);
    expect(proven).toMatchObject({
      category: "correctness",
      specialist: "bugs",
      title: "charge() dereferences a None currency when the account has no default",
      status: "published",
      blocking: true,
      location: { file_path: "app/billing/charge.py", start_line: 41, end_line: 44, symbol_path: "app/billing/charge.py::charge" },
      delivery: { mode: "inline_exact" },
      history: { occurrence_count: 2 },
    });
    const proof = proven.proof;
    expect(proof).toMatchObject({
      status: "proven",
      runner: "docker",
      isolation: "isolated",
      baseline_mode: "compared",
      test_file_path: BINDING_IDS.repro_test_path,
      command: "pytest tests/test_repro_7e3f1a.py -q -p no:cacheprovider",
    });
    expect(proof.test_code).toContain(`def ${BINDING_IDS.failing_test}():`);
    expect(proof.base.exit_code).toBe(0);
    expect(lastLines(proof.base.excerpt, 1)).toEqual(["1 passed in 0.42s"]);
    expect(proof.head.exit_code).toBe(1);
    expect(lastLines(proof.head.excerpt, 3)).toEqual(HEAD_TAIL);
    // The traceback's line number points at the failing statement of the test it ran.
    expect(proof.test_code.split("\n")[40]).toContain("assert charge(acct, 1200).currency");
  });

  it("refutes the disproven finding by execution and clamps it to info", () => {
    expect(disproven.status).toBe("disproven");
    expect(disproven.blocking).toBe(false);
    expect(disproven.proof.status).toBe("disproven");
    expect(lastLines(disproven.proof.head.excerpt, 1)).toEqual(["1 passed in 0.61s"]);
    expect(disproven.severity.band).toBe("info");
    expect(disproven.severity.notes).toContain("clamped to info: repro passed at head");
    const inconclusive = byId.get(BINDING_IDS.inconclusive_finding_id) as { proof: { status: string; base: { exit_code: number } } };
    expect(inconclusive.proof.status).toBe("inconclusive");
    expect(inconclusive.proof.base.exit_code).not.toBe(0);
  });

  it("renders the GitHub review from the fixture values", () => {
    const payload = demo.review_payload;
    expect(payload.event).toBe("COMMENT");
    expect(payload.commit_id).toBe(BINDING_IDS.head_sha);
    const inline = payload.comments[0];
    expect(inline.path).toBe("app/billing/charge.py");
    expect(inline.body).toContain("**`proof_status: proven`** · severity **`0.810`** critical");
    const fp: string = proven.fingerprint;
    expect(inline.body).toContain(`\`fingerprint ${fp.slice(0, 8)}…${fp.slice(-4)}\``);
    for (const line of HEAD_TAIL) expect(inline.body).toContain(`    ${line}`);
    const contributions = SEVERITY_INPUTS.map((name) => `${name} \`${(proven.severity.weights[name] * proven.severity.inputs[name]).toFixed(3)}\``);
    for (const part of contributions) expect(inline.body).toContain(part);
    expect(inline.body).toContain("how often we're wrong");
    expect(payload.body).toContain("in 41.2s");
    for (const text of [payload.body, ...payload.comments.map((c: { body: string }) => c.body)]) {
      expect(text).not.toMatch(/APPROVE|!(?!--)|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});

describe("fixture corpus: the audit chain", () => {
  const eventsText = raw("audit/events.json");
  const lossless = parseLossless(eventsText) as { items: { [key: string]: Lossless }[] };
  const events = load("audit/events.json");

  it("is the whole chain: contiguous from seq 1, linked, one tenant, verified", () => {
    events.items.forEach((item: { seq: number; prev_hash: string | null; tenant_id: string }, index: number) => {
      expect(item.seq).toBe(index + 1);
      expect(item.tenant_id).toBe(BINDING_IDS.tenant_id);
      expect(item.prev_hash).toBe(index === 0 ? null : events.items[index - 1].event_hash);
    });
    expect(events.chain).toMatchObject({ verified: true, checked: events.items.length, first_seq: 1, last_seq: events.items.length });
    const human = events.items.filter((item: { actor_type: string }) => item.actor_type === "human").map((item: { event_type: string }) => item.event_type);
    expect(human).toContain("suppression.created");
    expect(human).toContain("suppression.revoked");
    expect(human.filter((type: string) => type === "override.break_glass")).toHaveLength(1);
  });

  it("re-derives every event hash in TypeScript from the lexemes Python wrote", () => {
    for (const item of lossless.items) {
      const document = hashedDocument(item);
      expect(eventHash((item.prev_hash as string | null) ?? null, document), `seq ${(item.seq as Lexeme).text}`).toBe(item.event_hash);
    }
  });

  it("puts a demo-run event with a trailing-.0 float and 0.81 at the tamper seq", () => {
    const tamper = lossless.items[BINDING_IDS.tamper_demo_seq - 1];
    expect((tamper.seq as Lexeme).text).toBe(String(BINDING_IDS.tamper_demo_seq));
    expect(tamper.review_id).toBe(BINDING_IDS.demo_review_id);
    expect(tamper.finding_id).toBe(BINDING_IDS.proven_finding_id);
    const payload = canonical(tamper.payload);
    expect(payload).toContain('"severity_score":0.81');
    expect(payload).toMatch(/:1\.0[,}]/);
    // JSON.parse cannot see the difference; the canonical form can, and so can the hash.
    expect(JSON.stringify(JSON.parse(payload))).not.toBe(payload);
    const naive = { ...tamper, payload: parseLossless(JSON.stringify(JSON.parse(payload))) };
    expect(eventHash(tamper.prev_hash as string, hashedDocument(naive))).not.toBe(tamper.event_hash);
    expect(eventHash(tamper.prev_hash as string, hashedDocument(tamper))).toBe(tamper.event_hash);
  });
});

describe("fixture corpus: canonical-JSON vectors", () => {
  const vectors = parseLossless(raw("audit/vectors.json")) as { items: { [key: string]: Lossless }[] };
  const text = raw("audit/vectors.json");

  it("covers the briefed cases, with Python's lexemes intact in the raw file", () => {
    for (const lexeme of ["1.0", "0.5", "-0.0", "1e-05", "1.5e-07", "1e+16", "1.2345678901234568e+17", "12345678901234567890", "9007199254740993"]) {
      expect(text).toMatch(new RegExp(`: ${lexeme.replace(/[.+]/g, "\\$&")}[,\\n]`));
    }
    const all = vectors.items.map((item) => item.canonical as string).join("\n");
    for (const needle of ["café", "🧪", "\\n", "\\t", "\\u0001", '\\"', "\\\\", " ", "true", "false", "null", "{}", "[]"]) {
      expect(all, needle).toContain(needle);
    }
    expect(all).toMatch(/"created_at":"[^"]+\.\d{6}\+00:00"/);
    expect(all).toMatch(/"created_at":"[^".]+\+00:00"/);
  });

  it("canonicalises and hashes every vector exactly as the backend did", () => {
    for (const item of vectors.items) {
      expect(canonical(item.document), item.name as string).toBe(item.canonical);
      expect(eventHash(item.prev_hash as string | null, item.document), item.name as string).toBe(item.hash);
    }
  });
});

describe("fixture corpus: accuracy, cost, live run, suppressions", () => {
  it("publishes six distinct accuracy numbers, each with its n (plan A6)", () => {
    const proxies = report.precision_proxies;
    const inconclusiveRate = Math.round((report.proof.inconclusive / report.proof.attempted) * 1000) / 1000;
    const six = [
      proxies.execution_verified_precision.value,
      proxies.self_caught_false_positive_rate.value,
      proxies.human_dismissal_rate.value,
      proxies.addressed_rate.value,
      report.proof.proven_rate,
      inconclusiveRate,
    ];
    expect(six.every((value) => typeof value === "number")).toBe(true);
    expect(new Set(six).size).toBe(6);
    for (const metric of Object.values(proxies) as { n: number; definition: string }[]) {
      expect(metric.n).toBeGreaterThan(0);
      expect(metric.definition.length).toBeGreaterThan(0);
    }
    const { attempted, proven, disproven, inconclusive, skipped_no_env } = report.proof;
    expect(attempted).toBe(proven + disproven + inconclusive + skipped_no_env);
    expect(proxies.self_caught_false_positive_rate.value).toBe(report.proof.disproven_rate);
  });

  it("derives series.json from the same raw counts as report.json", () => {
    const counts = series.raw_counts;
    expect(counts.proof.attempted).toBe(report.proof.attempted);
    for (const key of ["proven", "disproven", "inconclusive", "skipped_no_env"] as const) {
      expect(series.weekly.reduce((sum: number, week: Record<string, number>) => sum + week[key], 0), key).toBe(report.proof[key]);
    }
    expect(series.calibration.reduce((sum: number, band: { n: number }) => sum + band.n, 0)).toBe(report.precision_proxies.human_dismissal_rate.n);
    expect(series.dismissal_by_category.reduce((sum: number, row: { published: number }) => sum + row.published, 0)).toBe(report.precision_proxies.human_dismissal_rate.n);
  });

  it("times the live demo run in STAGES order, summing to 41.2s", () => {
    const live = load("live/demo-run.json");
    expect(live.review_id).toBe(BINDING_IDS.demo_review_id);
    expect(live.time_scale).toBe(0.5);
    expect(live.stages.map((stage: { key: string }) => stage.key)).toEqual([...STAGES]);
    expect(live.stages.reduce((sum: number, stage: { duration_ms: number }) => sum + stage.duration_ms, 0)).toBe(41_200);
    expect(live.stages.every((stage: { label: string }) => stage.label.length > 0)).toBe(true);
  });

  it("summarises cost per stage in STAGES order, with a median near $0.98", () => {
    const cost = load("cost/summary.json");
    expect(cost.per_stage.map((stage: { stage: string }) => stage.stage)).toEqual([...STAGES]);
    expect(Math.abs(cost.cost_p50_usd - 0.98)).toBeLessThanOrEqual(0.05);
    expect(cost.cost_histogram.reduce((sum: number, bin: { runs: number }) => sum + bin.runs, 0)).toBe(cost.window.runs);
    for (const stage of cost.per_stage) expect(stage.p95_s).toBeGreaterThanOrEqual(stage.p50_s);
  });

  it("keeps a ledger of 12 active, 3 expired and 1 revoked suppressions, each with a reason", () => {
    const ledger = load("suppressions/index.json");
    expect(ledger.totals).toEqual({ active: 12, expired: 3, revoked: 1 });
    expect(ledger.items).toHaveLength(16);
    expect(new Set(ledger.items.map((item: { scope: string }) => item.scope))).toEqual(new Set(["line", "file", "pattern", "repo", "tenant"]));
    for (const item of ledger.items) expect(item.reason.trim().length).toBeGreaterThan(20);
    const demoSuppressed = demo.findings.find((f: { status: string }) => f.status === "suppressed");
    const active = ledger.items.filter((item: { active: boolean }) => item.active).map((item: { suppression_id: string }) => item.suppression_id);
    expect(active).toContain(demoSuppressed.suppression.suppression_id);
  });
});
