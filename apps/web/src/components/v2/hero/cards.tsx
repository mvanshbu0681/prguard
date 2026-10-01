// The hero's product cards. Each one shows something PR Guard really posted on
// the public sandbox (src/sandbox), drawn in otoma8's card language (20px
// radius, hairline, no shadow).
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import s from "./cards.module.css";
import { EyeGlyph } from "@/components/brand/EyeGlyph";

export interface HeroCardData {
  /** "acme-billing#26", the showcase review */
  reviewLabel: string;
  priority: string;
  risk: string;
  findings: number;
  /** severity counts in the review's summary, critical first */
  severityCounts: { severity: string; count: number }[];
  topSeverityLabel: string;
  commentTitle: string;
  commentVerified: boolean;
  checkConclusion: string;
  checkTitle: string;
  /** the measured walkthrough review (acme-billing#3) */
  walkthroughLabel: string;
  raw: number;
  posted: number;
  rejected: number;
  pullRequestsReviewed: number;
  reviews: number;
  /** reviews posted per hour across the snapshot, oldest first, empty hours as 0 */
  reviewsPerHour: number[];
  helpSeconds: number | null;
  bot: string;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function ReviewCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span className={s.label}>{d.reviewLabel}</span>
      <div className={s.spacer} />
      <div className={s.run}>
        <span className={s.sha}>priority</span>
        <span className={s.result}>{d.priority}</span>
      </div>
      <div className={s.run}>
        <span className={s.sha}>risk</span>
        <span className={cx(s.result, s.fail)}>{d.risk}</span>
      </div>
      <span className={cx(s.tag, s.tagLime)} style={{ marginTop: 10 }}>
        {d.findings} findings
      </span>
    </div>
  );
}

function FindingsCard({ d }: { d: HeroCardData }) {
  return (
    <div className={cx(s.card, s.dark)}>
      <span className={s.label}>Line comments</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 46 }}>
        {d.findings}
      </span>
      <span className={cx(s.tag, s.tagLime)} style={{ marginTop: 10 }}>
        {d.topSeverityLabel}
      </span>
      <div className={s.segments} aria-hidden>
        {d.severityCounts.map((c, i) => (
          <span key={c.severity} style={{ flex: c.count, opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}

function CommentsOnlyCard() {
  return (
    <div className={cx(s.card, s.glassCard)}>
      <div className={s.center}>
        <span className={s.ring}>
          <MessageSquareText size={20} strokeWidth={1.6} />
        </span>
        <span className={s.glassTitle}>Comments only</span>
        <span className={s.glassSub}>a person approves the merge</span>
      </div>
    </div>
  );
}

function FilteredCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span className={s.label}>Filtered before posting</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 52 }}>
        {d.raw - d.posted}
      </span>
      <span style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35, color: "rgba(19,19,19,.6)" }}>
        of {d.raw} raw findings on {d.walkthroughLabel} never reached the PR
      </span>
      <div style={{ display: "flex", gap: 4, marginTop: 12, whiteSpace: "nowrap" }}>
        <span className={cx(s.tag, s.tagSoft)}>{d.posted} posted</span>
        <span className={cx(s.tag, s.tagSoft)}>{d.rejected} rejected</span>
      </div>
    </div>
  );
}

function ActivityChart({ values }: { values: number[] }) {
  const w = 168;
  const h = 70;
  const max = Math.max(...values, 1);
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

function ActivityCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <span style={{ fontFamily: "var(--font-v2-display)", fontSize: 15, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}>
        Reviews in the
        <br />
        public sandbox
      </span>
      <span className={s.meta} style={{ marginTop: 6 }}>
        {d.reviews} reviews · {d.pullRequestsReviewed} PRs
      </span>
      <ActivityChart values={d.reviewsPerHour} />
    </div>
  );
}

function CommentCard({ d }: { d: HeroCardData }) {
  return (
    <div className={s.card}>
      <div className={s.author}>
        <span className={s.avatar} aria-hidden>
          <EyeGlyph size={18} />
        </span>
        <span style={{ display: "grid" }}>
          <span className={s.name}>{d.bot}</span>
          <span className={s.meta}>reviewed · comment</span>
        </span>
      </div>
      <p className={s.quote} dangerouslySetInnerHTML={{ __html: renderTicks(d.commentTitle) }} />
      <div className={s.spacer} />
      <span className={cx(s.tag, s.tagInk)}>{d.commentVerified ? "Verified" : "Posted"}</span>
    </div>
  );
}

function CheckCard({ d }: { d: HeroCardData }) {
  return (
    <div className={cx(s.card, s.limeCard)}>
      <span className={s.label}>Check run</span>
      <div className={s.spacer} />
      <span className={s.big} style={{ fontSize: 36 }}>
        {cap(d.checkConclusion)}
      </span>
      <span style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.35, color: "rgba(19,19,19,.7)", maxWidth: 120 }}>
        {d.checkTitle}. It never fails a check.
      </span>
      <span className={s.arrowChip} aria-hidden>
        <ArrowUpRight size={16} />
      </span>
    </div>
  );
}

function PipelineCard() {
  // fetch -> triage -> impact -> reviewers 4 at a time -> checks -> verify -> learnings -> fixes -> publish
  const y = 44;
  return (
    <div className={s.card}>
      <span className={s.label}>9 steps · 4 at a time</span>
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
      <span style={{ fontSize: 12, color: "rgba(19,19,19,.6)" }}>findings are verified before they post</span>
    </div>
  );
}

function CommandsCard({ d }: { d: HeroCardData }) {
  return (
    <div className={cx(s.card, s.dark)}>
      <span className={s.label}>Commands</span>
      <div className={s.spacer} />
      {["review", "explain", "fix", "ignore"].map((c) => (
        <div key={c} className={s.link}>
          <span className={s.seq}>@prguard</span>
          <span>{c}</span>
        </div>
      ))}
      {d.helpSeconds !== null ? (
        <span className={cx(s.tag, s.tagGlass)} style={{ marginTop: 10 }}>
          help in {d.helpSeconds} s
        </span>
      ) : null}
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
      <ReviewCard d={d} />
      <FindingsCard d={d} />
      <CommentsOnlyCard />
      <CommentCard d={d} />
      <CheckCard d={d} />
      <FilteredCard d={d} />
      <PipelineCard />
      <ActivityCard d={d} />
      <CommandsCard d={d} />
    </>
  );
}
