// Section 5, rebuilt on the otoma8.com "TEAM" composition: a left-aligned
// heading with prev/next controls, then a full-bleed carousel of grey cards.
// Where otoma8 shows a portrait, each card shows the proof of one real bug: a
// white proof card rising out of a sky crop, with the computed severity, its
// six weighted inputs and the base/head test results.
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, X } from "lucide-react";
import { SEVERITY_INPUTS } from "@/lib/contracts";
import { getFindings, getReviewsIndex } from "@/lib/fixtures";
import type { Finding } from "@/lib/api-types";
import { CarouselButtons } from "./CarouselButtons";
import s from "./caught.module.css";
import { EyeGlyph } from "@/components/brand/EyeGlyph";

const TRACK_ID = "caught-track";
const SHOWN = 8;
const SHADES = ["#cbf857", "#2b2b2b", "#454545", "#5f5f5f", "#7d7d7d", "#9a9a9a"];
/** Where each card's crop of the sky photo sits, so no two panels look alike. */
const CROPS = ["18% 30%", "72% 22%", "40% 64%", "86% 58%", "8% 70%", "56% 12%", "30% 40%", "64% 78%"];

const score = (f: Finding) => f.severity?.score ?? 0;

function ProofCard({ f }: { f: Finding }) {
  const sev = f.severity;
  const inputs = (sev?.inputs ?? {}) as Record<string, number>;
  const weights = (sev?.weights ?? {}) as Record<string, number>;
  const runs = [
    { at: "base", ok: f.proof?.base?.exit_code === 0 },
    { at: "head", ok: f.proof?.head?.exit_code === 0 },
  ];
  return (
    <div className={s.proof}>
      <div className={s.proofHead}>
        <span className={s.bot} aria-hidden>
          <EyeGlyph size={16} />
        </span>
        <span className={s.botName}>witness[bot]</span>
        <span className={`${s.band} ${s[`band_${sev?.band ?? "info"}`] ?? ""}`}>{sev?.band}</span>
      </div>
      <div className={s.scoreRow}>
        <span className={s.score}>{score(f).toFixed(3)}</span>
        <span className={s.scoreLabel}>computed severity</span>
      </div>
      <div className={s.bar} aria-hidden>
        {SEVERITY_INPUTS.map((k, i) => (
          <span key={k} style={{ width: `${(inputs[k] ?? 0) * (weights[k] ?? 0) * 100}%`, background: SHADES[i] }} />
        ))}
      </div>
      <div className={s.runs}>
        {runs.map((r) => (
          <span key={r.at} className={`${s.run} ${r.ok ? s.runPass : s.runFail}`}>
            {r.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
            {r.at} {r.ok ? "passed" : "failed"}
          </span>
        ))}
      </div>
      <div className={s.testFile}>{f.proof?.test_file_path}</div>
    </div>
  );
}

export function Caught() {
  const reviews = new Map(getReviewsIndex().items.map((r) => [r.review_id, r]));
  const seen = new Set<string>();
  const proven = getFindings()
    .filter((f) => f.status === "published" && f.proof?.status === "proven")
    .sort((a, b) => score(b) - score(a))
    .filter((f) => !seen.has(f.title) && seen.add(f.title))
    .slice(0, SHOWN);

  return (
    <section id="caught" className={s.section} aria-labelledby="caught-title">
      <div className={`${s.inner} ${s.reveal}`}>
        <p className={s.eyebrow}>
          <span aria-hidden>•</span>Proven findings
        </p>
        <h2 id="caught-title" className={s.h2}>
          Caught, then proven.
        </h2>
        <div className={s.headRow}>
          <Link href="/findings" className={s.cta}>
            <span className={s.ctaFull}>Browse findings</span>
            <span className={s.ctaShort}>Findings</span>
            <span className={s.ctaChip} aria-hidden>
              <ArrowUpRight size={18} strokeWidth={2} />
            </span>
          </Link>
          <CarouselButtons trackId={TRACK_ID} />
        </div>
      </div>

      <div id={TRACK_ID} className={s.track} role="region" aria-label="Proven findings" tabIndex={0}>
        {proven.map((f, i) => {
          const r = reviews.get(f.review_id);
          const where = `${f.location?.file_path ?? ""}${f.location?.start_line ? `:${f.location.start_line}` : ""}`;
          return (
            <Link key={f.id} href={`/findings/${f.id}`} className={`${s.card} ${s.reveal}`}>
              <h3 className={s.name}>{f.title}</h3>
              <p className={s.role}>
                {f.specialist}
                {r ? ` · ${r.repository.name} #${r.pull_request.number}` : ""}
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
                <ProofCard f={f} />
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
