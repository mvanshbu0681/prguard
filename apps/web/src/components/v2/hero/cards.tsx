// The hero's product cards. Each one is a real PRGuard artefact from the demo
// corpus, drawn in otoma8's card language (20px radius, hairline, no shadow).
import { ArrowUpRight, Check, FlaskConical, X } from "lucide-react";
import s from "./cards.module.css";

export interface HeroCardData {
  baseSha: string;
  headSha: string;
  baseResult: string;
  headResult: string;
  score: string;
  band: string;
  /** weight x input per severity input, in the canonical order, summing to the score */
  contributions: number[];
  proven: number;
  disproven: number;
  inconclusive: number;
  attempted: number;
  selfCaught: string;
  /** proven share of attempted proofs per week, oldest first */
  weeklyProvenShare: number[];
  findingTitle: string;
  blocking: number;
  advisory: number;
  chain: { seq: number; hash: string }[];
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function ProofCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span className={s.label}>Repro test · 2 runs</span>
      <div className={s.spacer} />
      <div className={s.run}>
        <span className={s.sha}>base {d.baseSha}</span>
        <span className={s.ok} aria-label="passed">
          <Check size={11} strokeWidth={3} />
        </span>
        <span className={s.result}>{d.baseResult}</span>
      </div>
      <div className={s.run}>
        <span className={s.sha}>head {d.headSha}</span>
        <span className={s.bad} aria-label="failed">
          <X size={11} strokeWidth={3} />
        </span>
        <span className={cx(s.result, s.fail)}>{d.headResult}</span>
      </div>
      <span className={cx(s.tag, s.tagLime)} style={{ marginTop: 10 }}>
        Proven
      </span>
    </div>
  );
}

function SeverityCard({ d }: { d: HeroCardData }) {
  const total = d.contributions.reduce((a, b) => a + b, 0);
  return (
    <div className={cx(s.card, s.dark)}>
      <span className={s.label}>Severity score</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 46 }}>
        {d.score}
      </span>
      <span className={cx(s.tag, s.tagLime)} style={{ marginTop: 10 }}>
        {d.band}
      </span>
      <div className={s.segments} aria-hidden>
        {d.contributions.map((c, i) => (
          <span key={i} style={{ flex: c, opacity: 1 - i * 0.12 }} />
        ))}
        <i className={s.segTrack} style={{ flex: Math.max(0, 1 - total) }} />
      </div>
    </div>
  );
}

function SandboxCard() {
  return (
    <div className={cx(s.card, s.glassCard)}>
      <div className={s.center}>
        <span className={s.ring}>
          <FlaskConical size={20} strokeWidth={1.6} />
        </span>
        <span className={s.glassTitle}>Sandboxed run</span>
        <span className={s.glassSub}>at your base and head SHA</span>
      </div>
    </div>
  );
}

function RefutedCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span className={s.label}>Refuted by itself</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 52 }}>
        {d.disproven}
      </span>
      <span style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35, color: "rgba(19,19,19,.6)" }}>
        of its own claims, disproved before they reached a PR
      </span>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <span className={cx(s.tag, s.tagSoft)}>{d.proven} proven</span>
        <span className={cx(s.tag, s.tagSoft)}>{d.inconclusive} open</span>
      </div>
    </div>
  );
}

function ShareChart({ values }: { values: number[] }) {
  const w = 168;
  const h = 70;
  const max = Math.max(...values, 0.01);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - (v / max) * (h - 8) - 4]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg className={s.chart} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id="hero-share" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e6fd9" stopOpacity="0.28" />
          <stop offset="1" stopColor="#1e6fd9" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#f0f0f2" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#hero-share)" />
      <path d={line} fill="none" stroke="#1e6fd9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.length ? <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="#1e6fd9" stroke="#fff" strokeWidth="2" /> : null}
    </svg>
  );
}

function ShareCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span style={{ fontFamily: "var(--font-v2-display)", fontSize: 15, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}>
        Proof in every
        <br />
        high-risk review
      </span>
      <span className={s.meta} style={{ marginTop: 6 }}>
        {d.attempted} repro tests run
      </span>
      <ShareChart values={d.weeklyProvenShare} />
    </div>
  );
}

function CommentCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <div className={s.author}>
        <span className={s.avatar} aria-hidden>
          <span>
            <i />
            <i />
          </span>
        </span>
        <span style={{ display: "grid" }}>
          <span className={s.name}>prguard[bot]</span>
          <span className={s.meta}>reviewed · comment</span>
        </span>
      </div>
      <p className={s.quote} dangerouslySetInnerHTML={{ __html: renderTicks(d.findingTitle) }} />
      <div className={s.spacer} />
      <span className={cx(s.tag, s.tagInk)}>Blocks merge</span>
    </div>
  );
}

function GateCard({ d }: { d: HeroCardData }) {
  return (
    <div className={cx(s.card, s.limeCard)}>
      <span className={s.label}>Merge gate</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 36 }}>
        Held
      </span>
      <span style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.35, color: "rgba(19,19,19,.7)", maxWidth: 120 }}>
        {d.blocking} proven bug blocks it. {d.advisory} more are advisory.
      </span>
      <span className={s.arrowChip} aria-hidden>
        <ArrowUpRight size={16} />
      </span>
    </div>
  );
}

function PipelineCard() {
  // ingest -> context -> 4 specialists in parallel -> coordinator -> severity -> identity -> proof -> delivery
  const y = 44;
  return (
    <div className={s.card}>
      <span className={s.label}>9 stages · 4 parallel</span>
      <svg className={s.pipe} viewBox="0 0 168 88" aria-hidden>
        <path d={`M8 ${y} H40`} stroke="#131313" strokeOpacity=".25" strokeWidth="1.5" />
        {[14, 34, 54, 74].map((yy) => (
          <path key={yy} d={`M40 ${y} C52 ${y} 50 ${yy} 62 ${yy} H78 C90 ${yy} 88 ${y} 100 ${y}`} fill="none" stroke="#1e6fd9" strokeOpacity=".55" strokeWidth="1.5" />
        ))}
        <path d={`M100 ${y} H160`} stroke="#131313" strokeOpacity=".25" strokeWidth="1.5" />
        {[8, 24, 40].map((x) => (
          <circle key={x} cx={x} cy={y} r="4" fill="#131313" />
        ))}
        {[14, 34, 54, 74].map((yy) => (
          <circle key={yy} cx="70" cy={yy} r="4.5" fill="#ffffff" stroke="#1e6fd9" strokeWidth="2" />
        ))}
        {[100, 116, 132].map((x) => (
          <circle key={x} cx={x} cy={y} r="4" fill="#131313" />
        ))}
        <circle cx="148" cy={y} r="7" fill="#cbf857" stroke="#131313" strokeWidth="1.5" />
        <circle cx="160" cy={y} r="3" fill="#131313" />
      </svg>
      <span style={{ fontSize: 12, color: "rgba(19,19,19,.6)" }}>the sandbox proof runs at stage 7</span>
    </div>
  );
}

function ChainCard({ d }: { d: HeroCardData }) {
  return (
    <div className={cx(s.card, s.dark)}>
      <span className={s.label}>Audit chain</span>
      <div className={s.spacer} />
      {d.chain.map((e) => (
        <div key={e.seq} className={s.link}>
          <span className={s.seq}>#{e.seq}</span>
          <span>{e.hash}</span>
        </div>
      ))}
      <span className={cx(s.tag, s.tagGlass)} style={{ marginTop: 10 }}>
        <Check size={10} strokeWidth={3} /> hash verified
      </span>
    </div>
  );
}

/** Backtick spans in a finding title become inline code; everything else is escaped. */
function renderTicks(text: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function HeroCards({ d }: { d: HeroCardData }) {
  return (
    <>
      <ProofCard d={d} />
      <SeverityCard d={d} />
      <SandboxCard />
      <CommentCard d={d} />
      <GateCard d={d} />
      <RefutedCard d={d} />
      <PipelineCard />
      <ShareCard d={d} />
      <ChainCard d={d} />
    </>
  );
}
