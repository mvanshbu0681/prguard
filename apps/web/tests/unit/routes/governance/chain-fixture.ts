// A small audit chain with REAL sha256 hashes (the sample corpus's are
// placeholders), built through the same canonical serialiser the page verifies
// with — so a test can watch the browser-side walk succeed, then break it with the
// tamper demo. Payload floats keep their Python lexemes (1.0, 1e-05) end to end.
import { parseLosslessJson, stringifyLosslessJson } from "@/api/lossless";
import { eventHash } from "@/lib/audit-verify";
import { auditHashDocument } from "@/lib/canonical-json";
import { DEMO_IDS } from "@/lib/demo-ids";
import { REVIEW_A, REVIEW_B } from "@/lib/fixture-sample";

type Raw = {
  seq: number;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  review_id: string | null;
  finding_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  tenant_id: string;
  event_hash: string;
  prev_hash: string | null;
};

const TENANT = DEMO_IDS.tenant_id;

/** Event templates as TEXT, so float lexemes survive (never JSON.parse). */
const BASE = [
  `{"seq":1,"event_type":"review.requested","actor_type":"system","actor_id":"webhook:github","review_id":"${REVIEW_A}","finding_id":null,"payload":{"repository":"acme/checkout-service","pr_number":4821,"trigger":"webhook"},"created_at":"2026-09-19T14:00:00Z"}`,
  `{"seq":2,"event_type":"finding.proposed","actor_type":"ai","actor_id":"specialist:bugs:claude-sonnet-5","review_id":"${REVIEW_A}","finding_id":"${DEMO_IDS.proven_finding_id}","payload":{"rule_key":"unguarded_none_attribute","severity_band":"critical","severity_score":0.81,"proof_confidence":1.0,"tiny":1e-05},"created_at":"2026-09-19T14:02:40Z"}`,
  `{"seq":3,"event_type":"proof.executed","actor_type":"system","actor_id":"proof-runner:docker","review_id":"${REVIEW_A}","finding_id":"${DEMO_IDS.proven_finding_id}","payload":{"proof_status":"proven","base_exit_code":0,"head_exit_code":1},"created_at":"2026-09-19T14:03:01Z"}`,
  `{"seq":4,"event_type":"override.break_glass","actor_type":"human","actor_id":"sana-q","review_id":"${REVIEW_A}","finding_id":"${DEMO_IDS.proven_finding_id}","payload":{"suppression_id":"s1000000-0000-4000-8000-000000000001","reason":"Hotfix window; tracked in INC-7."},"created_at":"2026-09-19T14:03:04Z"}`,
  `{"seq":5,"event_type":"gate.evaluated","actor_type":"system","actor_id":"gate","review_id":"${REVIEW_B}","finding_id":null,"payload":{"conclusion":"success","reason":"Nothing proven blocks."},"created_at":"2026-09-19T14:03:05Z"}`,
];

/** `count` events (templates repeated with fresh seqs past the fifth), each hashed onto the last. */
export async function buildChain(count = BASE.length): Promise<Raw[]> {
  const out: Raw[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const template = parseLosslessJson(BASE[i % BASE.length]) as Omit<Raw, "event_hash" | "prev_hash" | "tenant_id">;
    const seq = i + 1;
    const created = new Date(Date.parse("2026-09-19T14:00:00Z") + i * 7_000).toISOString().replace(".000Z", "Z");
    const e = { ...template, seq, created_at: created, tenant_id: TENANT } as Raw;
    const hash = await eventHash(prev, auditHashDocument({ ...e, payload: e.payload }));
    out.push({ ...e, prev_hash: prev, event_hash: hash });
    prev = hash;
  }
  return out;
}

/** audit/events.json as TEXT, lossless, with the server's own verdict. */
export function chainText(items: Raw[]): string {
  return stringifyLosslessJson({
    items,
    chain: { verified: true, checked: items.length, first_seq: items[0]?.seq ?? null, last_seq: items.at(-1)?.seq ?? null, broken_at_seq: null },
  });
}
