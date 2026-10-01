// Section 5, rebuilt on the otoma8.com "TEAM" composition: a left-aligned
// heading with prev/next controls, then a full-bleed carousel of grey cards.
// Where otoma8 shows a portrait, each card shows one real finding PR Guard
// posted on the public sandbox: a white comment card rising out of a sky crop,
// with its severity, what it said and the evidence it quoted. Each card opens
// that comment on GitHub.
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { BOT, prLabel, sandbox, type SandboxFinding } from "@/sandbox";
import { CarouselButtons } from "./CarouselButtons";
import s from "./caught.module.css";
import { EyeGlyph } from "@/components/brand/EyeGlyph";

const TRACK_ID = "caught-track";
/** Where each card's crop of the sky photo sits, so no two panels look alike. */
const CROPS = ["18% 30%", "72% 22%", "40% 64%", "86% 58%", "8% 70%", "56% 12%", "30% 40%", "64% 78%", "48% 50%"];
const plain = (t: string | null) => (t ?? "").replace(/`/g, "");

function CommentCard({ f }: { f: SandboxFinding }) {
  const flags = [f.verified && "verified", f.suggestion !== null && "suggestion"].filter((x): x is string => !!x);
  return (
    <div className={s.proof}>
      <div className={s.proofHead}>
        <span className={s.bot} aria-hidden>
          <EyeGlyph size={16} />
        </span>
        <span className={s.botName}>{BOT}</span>
        <span className={`${s.band} ${s[`band_${f.severity ?? "low"}`] ?? ""}`}>{f.severity}</span>
      </div>
      <p className={s.excerpt}>{plain(f.summary)}</p>
      {flags.length ? (
        <div className={s.runs}>
          {flags.map((flag) => (
            <span key={flag} className={`${s.run} ${s.runPass}`}>
              <Check size={10} strokeWidth={3} />
              {flag}
            </span>
          ))}
        </div>
      ) : null}
      <div className={s.testFile}>{f.evidence ? `evidence: ${plain(f.evidence)}` : "posted as a line comment"}</div>
    </div>
  );
}

export function Caught() {
  const findings = sandbox.featured;

  return (
    <section id="caught" className={s.section} aria-labelledby="caught-title">
      <div className={`${s.inner} ${s.reveal}`}>
        <p className={s.eyebrow}>
          <span aria-hidden>•</span>Real findings
        </p>
        <h2 id="caught-title" className={s.h2}>
          Caught in the sandbox.
        </h2>
        <div className={s.headRow}>
          <Link href={sandbox.orgUrl} className={s.cta}>
            <span className={s.ctaFull}>Browse the sandbox</span>
            <span className={s.ctaShort}>Sandbox</span>
            <span className={s.ctaChip} aria-hidden>
              <ArrowUpRight size={18} strokeWidth={2} />
            </span>
          </Link>
          <CarouselButtons trackId={TRACK_ID} />
        </div>
      </div>

      <div id={TRACK_ID} className={s.track} role="region" aria-label="Real findings" tabIndex={0}>
        {findings.map((f, i) => {
          const where = `${f.path}${f.line ? `:${f.line}` : ""}`;
          return (
            <Link key={f.url} href={f.url} className={`${s.card} ${s.reveal}`}>
              <h3 className={s.name}>{plain(f.title)}</h3>
              <p className={s.role}>
                {f.reviewers.join(" + ")} · {prLabel(f.repo, f.pr)}
              </p>
              <div className={s.panel} aria-hidden>
                <Image
                  src="/marketing/hero-sky.jpg"
                  alt=""
                  fill
                  sizes="468px"
                  className={s.photo}
                  style={{ transformOrigin: CROPS[i % CROPS.length] }}
                />
                <CommentCard f={f} />
              </div>
              <div className={s.foot}>
                <span className={s.where}>{where}</span>
                <span className={s.chip} aria-hidden>
                  <ArrowUpRight size={16} strokeWidth={2} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
