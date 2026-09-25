// The nine stage "videos": each is a small product UI that loops through what
// that stage did in the demo review. Pure markup; every value arrives in `d`,
// read from the demo corpus by Pipeline.tsx. The motion lives in CSS: an
// element with class `in` + `k{n}` appears at step n of the card's loop while
// the UI card itself stays put, and with reduced motion everything simply
// rests in its final state.
import type { CSSProperties, ReactNode } from "react";
import { Check, FileCode2, Webhook, X } from "lucide-react";
import { SEVERITY_INPUTS } from "@/lib/contracts";
import type { Finding } from "@/lib/api-types";
import s from "./pipeline.module.css";

export interface SceneData {
  repo: string;
  pr: number;
  author: string;
  base: string;
  head: string;
  files: { path: string; reviewed: boolean; note?: string }[];
  filesReviewed: number;
  filesExcluded: number;
  lanes: { key: string; initials: string; color: string; count: number }[];
  chips: { initials: string; color: string; dropped: boolean }[];
  kept: number;
  proven: Finding;
  fingerprint: string;
  seenRuns: number;
  suppressedTitle: string;
  suppressedScope: string;
  testFile: string;
  baseLine: string;
  headLine: string;
  errorLine: string;
  proofTally: { proven: number; disproven: number; inconclusive: number };
  ladder: { label: string; count: number }[];
  commentLine: number | null;
  gateReason: string;
  gateContext: string;
  chain: { seq: number; type: string; hash: string }[];
  events: number;
}

/** Appears at step `k` of the loop. */
const at = (k: number, extra = "") => `${s.in} ${s[`k${k}`]} ${extra}`;
const style = (v: Record<string, string | number>) => v as CSSProperties;

function Ui({ children, width = 300, dark = false }: { children: ReactNode; width?: number; dark?: boolean }) {
  return (
    <div className={dark ? s.term : s.ui} style={{ width }}>
      {children}
    </div>
  );
}

function Bot() {
  return (
    <span className={s.bot} aria-hidden>
      <i />
      <i />
    </span>
  );
}

export function IngestScene({ d }: { d: SceneData }) {
  const rows: [string, string][] = [
    ["repo", d.repo],
    ["pull request", `#${d.pr}`],
    ["author", d.author],
    ["base", d.base],
    ["head", d.head],
  ];
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.glyph}>
          <Webhook size={13} strokeWidth={2} />
        </span>
        <span className={s.monoStrong}>POST /webhooks/github</span>
        <span className={`${s.chip} ${s.chipLime} ${s.chipEnd} ${at(7)}`}>
          <Check size={10} strokeWidth={3} /> diff
        </span>
      </div>
      <div className={s.kvs}>
        {rows.map(([k, v], i) => (
          <div key={k} className={`${s.kv} ${at(i + 1)}`}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </Ui>
  );
}

export function ContextScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Changed files</span>
        <span className={s.meta}>
          {d.filesReviewed} reviewed · {d.filesExcluded} excluded
        </span>
      </div>
      <div className={s.files}>
        {d.files.map((f, i) => (
          <div key={f.path} className={`${s.file} ${f.reviewed ? "" : s.fileOut} ${at(i + 1)}`}>
            <FileCode2 size={12} strokeWidth={1.8} />
            <span className={s.filePath}>{f.path}</span>
            {f.reviewed ? (
              <span className={s.okDot}>
                <Check size={9} strokeWidth={3.2} />
              </span>
            ) : (
              <span className={s.tag}>{f.note}</span>
            )}
          </div>
        ))}
      </div>
    </Ui>
  );
}

export function SpecialistsScene({ d }: { d: SceneData }) {
  const most = Math.max(...d.lanes.map((l) => l.count), 1);
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Specialist passes</span>
        <span className={s.meta}>in parallel</span>
      </div>
      <div className={s.lanes}>
        {d.lanes.map((l, i) => (
          <div key={l.key} className={s.lane}>
            <span className={s.avatar} style={{ background: l.color }}>
              {l.initials}
            </span>
            <span className={s.laneName}>{l.key}</span>
            <span className={s.track}>
              <span className={`${s.fill} ${s[`f${i}`]}`} style={{ width: `${(l.count / most) * 100}%` }} />
            </span>
            <span className={`${s.count} ${at(6 + i)}`}>{l.count}</span>
          </div>
        ))}
      </div>
    </Ui>
  );
}

export function CoordinatorScene({ d }: { d: SceneData }) {
  let drop = 0;
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>{d.chips.length} raised</span>
        <span className={`${s.meta} ${at(9)}`}>{d.kept} kept</span>
      </div>
      <div className={s.chips}>
        {d.chips.map((c, i) => (
          <span key={i} className={`${s.fchip} ${c.dropped ? `${s.out} ${s[`o${1 + drop++}`]}` : ""}`}>
            <i style={{ background: c.color }} />
            {c.initials}
          </span>
        ))}
      </div>
      <div className={s.legend}>
        <span>
          <i className={s.legendKept} /> kept
        </span>
        <span>
          <i className={s.legendDropped} /> dropped as noise or duplicate
        </span>
      </div>
    </Ui>
  );
}

export function SeverityScene({ d }: { d: SceneData }) {
  const sev = d.proven.severity;
  const inputs = (sev?.inputs ?? {}) as Record<string, number>;
  const weights = (sev?.weights ?? {}) as Record<string, number>;
  const shades = ["#cbf857", "#2b2b2b", "#454545", "#5f5f5f", "#7d7d7d", "#9a9a9a"];
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Computed severity</span>
        <span className={`${s.band} ${at(8)}`}>{sev?.band}</span>
      </div>
      <span className={s.bigScore}>{(sev?.score ?? 0).toFixed(3)}</span>
      <div className={s.bar}>
        {SEVERITY_INPUTS.map((k, i) => (
          <span
            key={k}
            className={`${s.seg} ${s[`g${i}`]}`}
            style={{ width: `${(inputs[k] ?? 0) * (weights[k] ?? 0) * 100}%`, background: shades[i] }}
          />
        ))}
      </div>
      <div className={s.inputs}>
        {SEVERITY_INPUTS.map((k, i) => (
          <span key={k} className={at(i + 1)}>
            <i style={{ background: shades[i] }} />
            {k.replace(/_/g, " ")} <b>{(inputs[k] ?? 0).toFixed(2)}</b>
          </span>
        ))}
      </div>
    </Ui>
  );
}

export function IdentityScene({ d }: { d: SceneData }) {
  const groups = d.fingerprint.slice(0, 32).match(/.{8}/g) ?? [];
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Fingerprint</span>
        <span className={s.meta}>sha-256</span>
      </div>
      <div className={s.hash}>
        {groups.map((g, i) => (
          <span key={i} className={s[`hs${i}`]}>
            {g}
          </span>
        ))}
      </div>
      <div className={`${s.kv} ${at(5)}`}>
        <span>seen before</span>
        <b>{d.seenRuns} runs</b>
      </div>
      <div className={`${s.ledger} ${at(7)}`}>
        <span className={s.ledgerTitle}>{d.suppressedTitle}</span>
        <span className={s.tag}>suppressed · {d.suppressedScope} rule</span>
      </div>
    </Ui>
  );
}

export function ProofScene({ d }: { d: SceneData }) {
  return (
    <Ui dark width={318}>
      <div className={s.termBar}>
        <i />
        <i />
        <i />
        <span>{d.testFile}</span>
      </div>
      <div className={s.termBody}>
        <div className={at(1)}>
          <span className={s.dim}>$</span> pytest {d.testFile} -q
        </div>
        <div className={at(3)}>
          <span className={s.dim}>base {d.base} </span>
          <span className={s.pass}>{d.baseLine}</span>
        </div>
        <div className={at(5)}>
          <span className={s.dim}>head {d.head} </span>
          <span className={s.failTxt}>{d.headLine}</span>
        </div>
        <div className={`${s.failTxt} ${s.clip} ${at(6)}`}>{d.errorLine}</div>
      </div>
      <div className={`${s.tally} ${at(8)}`}>
        <span className={s.tProven}>{d.proofTally.proven} proven</span>
        <span className={s.tRefuted}>{d.proofTally.disproven} refuted</span>
        <span className={s.tOpen}>{d.proofTally.inconclusive} inconclusive</span>
      </div>
    </Ui>
  );
}

export function DeliveryScene({ d }: { d: SceneData }) {
  const f = d.proven;
  const file = (f.location?.file_path ?? "").split("/").pop();
  return (
    <Ui width={310}>
      <div className={s.uiHead}>
        <Bot />
        <span className={s.comment}>
          <b>prguard[bot]</b> on {file}
          {d.commentLine ? `:${d.commentLine}` : ""}
        </span>
      </div>
      <p className={`${s.commentBody} ${at(2)}`}>{f.title}</p>
      <div className={`${s.row} ${at(4)}`}>
        <span className={s.band}>{f.severity?.band}</span>
        <span className={`${s.chip} ${s.chipLime}`}>
          <Check size={10} strokeWidth={3} /> proven
        </span>
      </div>
      <div className={s.ladder}>
        {d.ladder.map((r, i) => (
          <span key={r.label} className={`${s.rung} ${r.count ? "" : s.rungEmpty} ${at(6 + i)}`}>
            {r.label} <b>{r.count}</b>
          </span>
        ))}
      </div>
    </Ui>
  );
}

export function FinaliseScene({ d }: { d: SceneData }) {
  return (
    <Ui width={318}>
      <div className={s.uiHead}>
        <span className={s.xDot}>
          <X size={10} strokeWidth={3.2} />
        </span>
        <span className={s.monoStrong}>{d.gateContext}</span>
        <span className={s.failPill}>failing</span>
      </div>
      <p className={`${s.reason} ${at(2)}`}>{d.gateReason}</p>
      <div className={s.chain}>
        {d.chain.map((b, i) => (
          <span key={b.seq} className={s.chainItem}>
            {i > 0 ? <i className={`${s.link} ${at(3 + i * 2)}`} /> : null}
            <span className={`${s.block} ${i === d.chain.length - 1 ? s.blockNew : ""} ${at(4 + i * 2)}`}>
              <span className={s.dim2}>#{b.seq}</span>
              <span>{b.hash}</span>
              <span className={s.blockType}>{b.type}</span>
            </span>
          </span>
        ))}
      </div>
      <span className={`${s.meta} ${at(9)}`} style={style({ display: "block", marginTop: 10 })}>
        {d.events} audit events · chain verified
      </span>
    </Ui>
  );
}
