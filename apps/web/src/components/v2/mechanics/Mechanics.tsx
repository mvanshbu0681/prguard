// Section 3, rebuilt on the otoma8.com "SERVICES" composition: the three
// mechanics as image cards, where each image band is a rendered product visual
// built from what PR Guard posted on the public sandbox (the evidence on a
// verified comment, a review's priority and risk, the learnings that teach it).
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { DEFAULTS, prLabel, sandbox } from "@/sandbox";
import s from "./mechanics.module.css";

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis" } as const;
const stripTicks = (t: string | null | undefined) => (t ?? "").replace(/`/g, "");

/** The finding this section shows: the showcase review's verified finding with evidence and a suggestion. */
const evidenceFinding = () => sandbox.featured.find((f) => f.verified && f.evidence && f.suggestion) ?? sandbox.featured[0];

function EvidenceVisual() {
  const f = evidenceFinding();
  // The evidence is one sentence that opens with the quoted code: "`code` at `path:line` ...".
  const quoted = f.evidence?.match(/^`([^`]+)`/)?.[1] ?? "";
  const rest = stripTicks(quoted ? f.evidence?.slice(quoted.length + 2) : f.evidence).trim();
  return (
    <div className={`${s.visualInner} ${s.term}`} aria-hidden>
      <div className={s.termBar}>
        <i />
        <i />
        <i />
        <span className={s.termFile}>
          {f.path}:{f.line}
        </span>
        <span className={s.termTag}>Verified</span>
      </div>
      <div className={s.termBody}>
        <div style={ellipsis}>
          <span className={s.dim}>finding </span>
          {stripTicks(f.title)}
        </div>
        <div style={ellipsis}>
          <span className={s.dim}>quotes </span>
          <span className={s.failTxt}>{quoted}</span>
        </div>
        <div className={s.dim} style={ellipsis}>
          {rest}
        </div>
        <div style={ellipsis}>
          <span className={s.dim}>suggests </span>
          <span className={s.pass}>{f.suggestion?.trim()}</span>
        </div>
      </div>
    </div>
  );
}

function PriorityVisual() {
  const show = sandbox.showcase;
  const counts = show.severityCounts;
  const total = counts.reduce((a, c) => a + c.count, 0) || 1;
  const shades = ["#cbf857", "#2b2b2b", "#5f5f5f", "#9a9a9a", "#bcbcbc"];
  const parts = counts.map((c, i) => {
    const width = c.count / total;
    const before = counts.slice(0, i).reduce((a, x) => a + x.count, 0) / total;
    return { ...c, width, mid: before + width / 2, color: shades[i] ?? shades[shades.length - 1] };
  });
  return (
    <div className={s.visualInner} aria-hidden>
      <Image src="/marketing/hero-sky.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className={s.skyPhoto} />
      <div className={s.glass}>
        <div className={s.glassHead}>
          <span className={s.score}>{show.priority?.alt.split(" ")[0]}</span>
          <span className={s.band}>{show.risk?.alt}</span>
        </div>
        <div className={s.bar}>
          {parts.map((p) => (
            <span key={p.severity} style={{ width: `${p.width * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className={s.ticks}>
          {parts.map((p) => (
            <span key={p.severity} style={{ left: `${p.mid * 100}%` }}>
              {p.count} {p.severity}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LearningVisual() {
  const c = sandbox.commands;
  const blocks = [
    { seq: "command", hash: "@prguard ignore", type: "on a finding", live: true },
    { seq: "reaction", hash: "thumbs down", type: "on a comment", live: false },
    { seq: "reply", hash: "“on purpose”", type: "intentional", live: false },
  ];
  return (
    <div className={`${s.visualInner} ${s.chain}`} aria-hidden>
      <span className={s.fp}>{prLabel(c.repo, c.pr)} · write access only</span>
      {blocks.map((b, i) => (
        <span key={b.seq} style={{ display: "contents" }}>
          {i > 0 ? <i className={s.connector} /> : null}
          <span className={`${s.block} ${b.live ? s.blockLive : ""}`}>
            <span className={s.blockSeq}>{b.seq}</span>
            <span className={s.blockHash}>{b.hash}</span>
            <span className={s.blockType}>{b.type}</span>
          </span>
        </span>
      ))}
      <span className={s.verified}>
        <Check size={11} strokeWidth={3} /> learning saved
      </span>
    </div>
  );
}

export function Mechanics() {
  const finding = evidenceFinding();
  const ignore = sandbox.commands.asked.find((a) => a.command.startsWith("@prguard ignore"));
  const cards = [
    {
      visual: <EvidenceVisual />,
      title: "Checked against your code",
      desc: `Findings of ${DEFAULTS.verifyFrom} severity and up go back to a model that reads your repository. It has to quote real code to confirm or reject one, and the quote ships as evidence.`,
      href: finding.url,
    },
    {
      visual: <PriorityVisual />,
      title: "Priority and risk, with reasons",
      desc: "Every review gets a priority from P0 to P3 for business impact and a risk level read from the code, and each one says why.",
      href: sandbox.showcase.reviewUrl,
    },
    {
      visual: <LearningVisual />,
      title: "Learns what your team dismisses",
      desc: "@prguard ignore, a thumbs-down or a reply saying the code is intentional becomes a learning for the repository. Matching findings stop coming back.",
      href: ignore?.url ?? sandbox.commands.url,
    },
  ];

  return (
    <section id="how" className={s.section} aria-labelledby="how-title">
      <div className={s.inner}>
        <div className={`${s.head} ${s.reveal}`}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>What it does
          </p>
          <h2 id="how-title" className={s.h2}>
            <span>Evidence built into</span>
            <span>every pull request</span>
          </h2>
          <p className={s.sub}>Three mechanics that keep an AI reviewer&rsquo;s comments few, checked and worth acting on.</p>
          <Link href={finding.url} className={s.cta}>
            <span className={s.ctaFull}>See a real finding</span>
            <span className={s.ctaShort}>See a finding</span>
            <span className={s.ctaChip} aria-hidden>
              <ArrowUpRight size={18} strokeWidth={2} />
            </span>
          </Link>
        </div>

        <div className={s.grid}>
          {cards.map((c, i) => (
            <article key={c.title} className={`${s.card} ${s.reveal} ${i === 1 ? s.reveal2 : ""} ${i === 2 ? s.reveal3 : ""}`}>
              <div className={s.visual}>{c.visual}</div>
              <div className={s.body}>
                <h3 className={s.title}>{c.title}</h3>
                <p className={s.desc}>{c.desc}</p>
                <Link href={c.href} className={s.more}>
                  See it on GitHub
                  <ArrowUpRight size={13} strokeWidth={2} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
