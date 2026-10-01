// The nine step "videos": each is a small product UI that loops through what
// that step of a PR Guard review does, on the measured review of
// acme-billing#3. Pure markup; every value arrives in `d`, read by Pipeline.tsx
// from the public pull request (src/sandbox/snapshot.json), the team's
// measurement of that review, or the code (src/sandbox/facts.ts). The motion
// lives in CSS: an element with class `in` + `k{n}` appears at step n of the
// card's loop while the UI card itself stays put, and with reduced motion
// everything simply rests in its final state.
import type { CSSProperties, ReactNode } from "react";
import { Check, FileCode2, Webhook } from "lucide-react";
import type { SandboxFinding } from "@/sandbox";
import s from "./pipeline.module.css";
import { EyeGlyph } from "@/components/brand/EyeGlyph";

export interface SceneData {
  repo: string;
  pr: number;
  author: string;
  base: string;
  head: string;
  files: { path: string; additions: number }[];
  reviewersRun: number;
  reviewersTotal: number;
  parallelism: number;
  lanes: { name: string; initials: string; color: string; count: number }[];
  raw: number;
  posted: number;
  verified: number;
  rejected: number;
  verifyFrom: string;
  comment: SandboxFinding;
  bot: string;
  learning: { text: string; pr: string };
  learningsInPrompt: number;
  fixed: { title: string; pr: string };
  checkConclusion: string;
  approvals: number;
  /** one finding from each code check, from the pull requests they ran on */
  checks: { check: string; title: string; pr: string }[];
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
      <EyeGlyph size={16} />
    </span>
  );
}

function Rows({ rows, from = 1 }: { rows: [string, ReactNode][]; from?: number }) {
  return (
    <div className={s.kvs}>
      {rows.map(([k, v], i) => (
        <div key={k} className={`${s.kv} ${at(from + i)}`}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function FetchScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.glyph}>
          <Webhook size={13} strokeWidth={2} />
        </span>
        <span className={s.monoStrong}>POST /api/webhooks</span>
        <span className={`${s.chip} ${s.chipLime} ${s.chipEnd} ${at(7)}`}>
          <Check size={10} strokeWidth={3} /> diff
        </span>
      </div>
      <Rows
        rows={[
          ["repo", d.repo],
          ["pull request", `#${d.pr}`],
          ["author", d.author],
          ["base", d.base],
          ["head", d.head],
        ]}
      />
    </Ui>
  );
}

export function TriageScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Changed files</span>
        <span className={s.meta}>{d.files.length} files · 1 fast call</span>
      </div>
      <div className={s.files}>
        {d.files.map((f, i) => (
          <div key={f.path} className={`${s.file} ${at(i + 1)}`}>
            <FileCode2 size={12} strokeWidth={1.8} />
            <span className={s.filePath}>{f.path}</span>
            <span className={s.tag}>+{f.additions}</span>
          </div>
        ))}
      </div>
    </Ui>
  );
}

export function ImpactScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Impact analysis</span>
        <span className={s.meta}>head snapshot</span>
      </div>
      <Rows
        rows={[
          ["snapshot", d.head],
          ["reads", "symbols around changed lines"],
          ["finds", "every other place they are used"],
          ["sends", "the callers to the reviewers"],
        ]}
      />
    </Ui>
  );
}

export function ReviewScene({ d }: { d: SceneData }) {
  const most = Math.max(...d.lanes.map((l) => l.count), 1);
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Posted per reviewer</span>
        <span className={s.meta}>{d.parallelism} at a time</span>
      </div>
      <div className={s.lanes}>
        {d.lanes.map((l, i) => (
          <div key={l.name} className={s.lane}>
            <span className={s.avatar} style={{ background: l.color }}>
              {l.initials}
            </span>
            <span className={s.laneName}>{l.name}</span>
            <span className={s.track}>
              <span className={`${s.fill} ${s[`f${i}`]}`} style={{ width: `${(l.count / most) * 100}%` }} />
            </span>
            <span className={`${s.count} ${at(5 + i)}`}>{l.count}</span>
          </div>
        ))}
      </div>
    </Ui>
  );
}

export function ChecksScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Code checks</span>
        <span className={s.meta}>no model calls</span>
      </div>
      {d.checks.map((c, i) => (
        <div key={c.check} className={`${s.ledger} ${s.note} ${at(1 + i * 3)}`} style={style({ marginTop: i ? 8 : 0 })}>
          <span className={s.ledgerTitle}>{c.title}</span>
          <span className={s.tag}>{c.check}</span>
        </div>
      ))}
    </Ui>
  );
}

export function VerifyScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Verification</span>
        <span className={s.meta}>{d.verifyFrom} and up</span>
      </div>
      <Rows
        rows={[
          ["raw findings", d.raw],
          ["confirmed with quoted code", d.verified],
          ["rejected and dropped", d.rejected],
          ["posted", d.posted],
        ]}
      />
    </Ui>
  );
}

export function LearningsScene({ d }: { d: SceneData }) {
  return (
    <Ui>
      <div className={s.uiHead}>
        <span className={s.label}>Learnings</span>
        <span className={s.meta}>{d.learning.pr}</span>
      </div>
      <div className={`${s.ledger} ${s.note} ${at(2)}`}>
        <span className={s.ledgerTitle}>{d.learning.text}</span>
        <span className={s.tag}>from @prguard ignore</span>
      </div>
      <div style={style({ marginTop: 10 })}>
        <Rows
          from={4}
          rows={[
            ["in every prompt", `${d.learningsInPrompt} most recent`],
            ["matching findings", "not posted"],
          ]}
        />
      </div>
    </Ui>
  );
}

export function FixesScene({ d }: { d: SceneData }) {
  return (
    <Ui width={318}>
      <div className={s.uiHead}>
        <span className={s.okDot}>
          <Check size={10} strokeWidth={3.2} color="#ffffff" />
        </span>
        <span className={s.monoStrong}>PR Guard</span>
        <span className={`${s.chip} ${s.chipLime} ${s.chipEnd}`}>{d.checkConclusion}</span>
      </div>
      <p className={`${s.reason} ${at(2)}`}>{d.fixed.title}</p>
      <span className={`${s.meta} ${at(5)}`} style={style({ display: "block", marginTop: 10 })}>
        check run on {d.fixed.pr}, after a fix was pushed
      </span>
    </Ui>
  );
}

export function PublishScene({ d }: { d: SceneData }) {
  const f = d.comment;
  const file = f.path.split("/").pop();
  return (
    <Ui width={310}>
      <div className={s.uiHead}>
        <Bot />
        <span className={s.comment}>
          <b>{d.bot}</b> on {file}
          {f.line ? `:${f.line}` : ""}
        </span>
      </div>
      <p className={`${s.commentBody} ${at(2)}`}>{(f.title ?? "").replace(/`/g, "")}</p>
      <div className={`${s.row} ${at(4)}`}>
        <span className={s.band}>{f.severity}</span>
        {f.verified ? (
          <span className={`${s.chip} ${s.chipLime}`}>
            <Check size={10} strokeWidth={3} /> verified
          </span>
        ) : null}
      </div>
      <div className={s.ladder}>
        {[
          ["line comments", d.posted],
          ["check", d.checkConclusion],
          ["approvals", d.approvals],
        ].map(([label, value], i) => (
          <span key={String(label)} className={`${s.rung} ${at(6 + i)}`}>
            {label} <b>{value}</b>
          </span>
        ))}
      </div>
    </Ui>
  );
}
