// Section 3, rebuilt on the otoma8.com "SERVICES" composition: the three
// mechanics as image cards, where each image band is a rendered product visual
// built from the demo corpus (the repro run, the severity bar, the audit chain).
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { SEVERITY_INPUTS, SEVERITY_THRESHOLDS } from "@/lib/contracts";
import { getAuditChain, getDemoProvenFinding, getManifest } from "@/lib/fixtures";
import s from "./mechanics.module.css";

const last = (text: string | null | undefined) => (text ?? "").trim().split("\n").pop() ?? "";

function TerminalVisual() {
  const { ids } = getManifest();
  const proof = getDemoProvenFinding().proof;
  const headLines = (proof?.head?.excerpt ?? "").split("\n");
  const errorLine = headLines.find((l) => l.startsWith("E ")) ?? "";
  const whereLine = headLines.find((l) => /\.py:\d+:/.test(l)) ?? "";
  const file = proof?.test_file_path ?? ids.repro_test_path;
  return (
    <div className={`${s.visualInner} ${s.term}`} aria-hidden>
      <div className={s.termBar}>
        <i />
        <i />
        <i />
        <span className={s.termFile}>{file}</span>
        <span className={s.termTag}>Proven</span>
      </div>
      <div className={s.termBody}>
        <div>
          <span className={s.dim}>$</span> pytest {file.split("/").pop()} -q
        </div>
        <div>
          <span className={s.dim}>base {ids.base_sha.slice(0, 7)} </span>
          <span className={s.pass}>{last(proof?.base?.excerpt)}</span>
        </div>
        <div>
          <span className={s.dim}>head {ids.head_sha.slice(0, 7)} </span>
          <span className={s.failTxt}>{last(proof?.head?.excerpt)}</span>
        </div>
        <div className={s.failTxt} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {errorLine.replace(/^E\s+/, "E  ")}
        </div>
        {whereLine ? <div className={s.dim}>{whereLine}</div> : null}
      </div>
    </div>
  );
}

function SeverityVisual() {
  const sev = getDemoProvenFinding().severity;
  const inputs = (sev?.inputs ?? {}) as Record<string, number>;
  const weights = (sev?.weights ?? {}) as Record<string, number>;
  const parts = SEVERITY_INPUTS.map((k) => (inputs[k] ?? 0) * (weights[k] ?? 0));
  const shades = ["#131313", "#2b2b2b", "#454545", "#5f5f5f", "#7d7d7d", "#9a9a9a"];
  const ticks = Object.entries(SEVERITY_THRESHOLDS);
  return (
    <div className={s.visualInner} aria-hidden>
      <Image src="/marketing/hero-sky.jpg" alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className={s.skyPhoto} />
      <div className={s.glass}>
        <div className={s.glassHead}>
          <span className={s.score}>{(sev?.score ?? 0).toFixed(3)}</span>
          <span className={s.band}>{sev?.band}</span>
        </div>
        <div className={s.bar}>
          {parts.map((p, i) => (
            <span key={SEVERITY_INPUTS[i]} style={{ width: `${p * 100}%`, background: i === 0 ? "#cbf857" : shades[i] }} />
          ))}
        </div>
        <div className={s.ticks}>
          {ticks.map(([band, at]) => (
            <span key={band} style={{ left: `${at * 100}%` }}>
              <i className={s.tickLine} />
              {at.toFixed(2).replace(/^0/, "")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChainVisual() {
  const { ids } = getManifest();
  const chain = getAuditChain().items;
  const at = chain.findIndex((e) => e.seq === ids.tamper_demo_seq);
  const window = chain.slice(Math.max(0, at - 1), Math.max(0, at - 1) + 3);
  const fp = ids.proven_fingerprint;
  return (
    <div className={`${s.visualInner} ${s.chain}`} aria-hidden>
      <span className={s.fp}>
        fingerprint {fp.slice(0, 8)}…{fp.slice(-4)}
      </span>
      {window.map((e, i) => (
        <span key={e.seq} style={{ display: "contents" }}>
          {i > 0 ? <i className={s.connector} /> : null}
          <span className={`${s.block} ${e.seq === ids.tamper_demo_seq ? s.blockLive : ""}`}>
            <span className={s.blockSeq}>#{e.seq}</span>
            <span className={s.blockHash}>
              {e.event_hash.slice(0, 6)}…{e.event_hash.slice(-2)}
            </span>
            <span className={s.blockType} title={e.event_type}>
              {e.event_type.split(".").pop()?.replace(/_/g, " ")}
            </span>
          </span>
        </span>
      ))}
      <span className={s.verified}>
        <Check size={11} strokeWidth={3} /> chain verified
      </span>
    </div>
  );
}

export function Mechanics() {
  const { ids } = getManifest();
  const cards = [
    {
      visual: <TerminalVisual />,
      title: "Proof by execution",
      desc: "A repro test runs at your base and head commit. The failing output is attached to the finding, so nobody argues about whether the bug is real.",
      href: `/findings/${ids.proven_finding_id}`,
    },
    {
      visual: <SeverityVisual />,
      title: "Severity you can recompute",
      desc: "Six weighted inputs, printed next to the score. Reachability, blast radius, test coverage: arithmetic you can check by hand.",
      href: "/settings/policy",
    },
    {
      visual: <ChainVisual />,
      title: "A record nobody can edit",
      desc: "Fingerprints stop the same nitpick from coming back, and every decision lands in a hash-chained audit trail.",
      href: "/audit",
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
          <p className={s.sub}>Three mechanics that replace an AI reviewer&rsquo;s opinion with evidence your team can check, re‑run and audit.</p>
          <Link href={`/findings/${ids.proven_finding_id}`} className={s.cta}>
            <span className={s.ctaFull}>See a proven finding</span>
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
                  Learn more
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
