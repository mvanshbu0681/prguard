// Section 6, rebuilt on the otoma8.com "PRICING" composition: a centred head
// and three plan cards in a grey tray. Witness has no plans to sell, so the
// three cards are its three review depths (risk tiers), and the price slot is
// the real median cost of a review at that depth from the demo corpus.
import Link from "next/link";
import { ArrowUpRight, Check, Feather, Layers, Minus, ShieldCheck, type LucideIcon } from "lucide-react";
import { getManifest, getReviewsIndex } from "@/lib/fixtures";
import type { RiskTier } from "@/lib/contracts";
import s from "./depth.module.css";

const SPECIALISTS = [
  { key: "bugs", label: "Bugs & correctness" },
  { key: "security", label: "Security" },
  { key: "tests", label: "Tests" },
  { key: "quality", label: "Quality" },
] as const;

/** The tier rules, as the dashboard's /settings/policy page states them. */
const TIERS: { tier: RiskTier; name: string; icon: LucideIcon; desc: string; runs: readonly string[] }[] = [
  { tier: "trivial", name: "Trivial", icon: Feather, desc: "Up to 10 changed lines. A fast pass for small fixes.", runs: ["bugs", "security"] },
  { tier: "standard", name: "Standard", icon: Layers, desc: "Up to 200 changed lines, with the tests specialist joining in.", runs: ["bugs", "security", "tests"] },
  {
    tier: "full",
    name: "Full",
    icon: ShieldCheck,
    desc: "Anything larger, or any path under auth, payments, crypto, migrations or PII.",
    runs: ["bugs", "security", "tests", "quality"],
  },
];

/** A tiny diff glyph per tier: its line count grows with the change it covers. */
const DIFF: Record<RiskTier, [add: boolean, width: number][]> = {
  trivial: [[false, 58], [true, 74]],
  standard: [[false, 46], [true, 82], [true, 64], [false, 36]],
  full: [[true, 70], [false, 44], [true, 92], [true, 58], [false, 80], [true, 66]],
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

export function Depth() {
  const { ids } = getManifest();
  const runs = getReviewsIndex().items.filter((r) => r.status === "succeeded");

  const cards = TIERS.map((t) => {
    const mine = runs.filter((r) => r.risk_tier === t.tier);
    const sample =
      t.tier === "full"
        ? ids.demo_review_id
        : [...mine].sort((a, b) => (b.counts?.published ?? 0) - (a.counts?.published ?? 0))[0]?.review_id;
    return {
      ...t,
      count: mine.length,
      cost: median(mine.map((r) => r.cost_usd_estimate ?? 0)),
      seconds: median(mine.map((r) => r.duration_seconds ?? 0)),
      href: sample ? `/runs/${sample}` : "/runs",
    };
  });

  return (
    <section id="depth" className={s.section} aria-labelledby="depth-title">
      <div className={s.inner}>
        <div className={`${s.head} ${s.reveal}`}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>Review depth
          </p>
          <h2 id="depth-title" className={s.h2}>
            <span>Every pull request gets</span>
            <span>the review it needs</span>
          </h2>
          <p className={s.sub}>
            Witness sizes each review to the change. Small diffs get a fast pass; anything touching auth, payments, crypto,
            migrations or PII gets all four specialists.
          </p>
          <Link href="/settings/policy" className={s.cta}>
            Read the policy
            <span className={s.ctaChip} aria-hidden>
              <ArrowUpRight size={18} strokeWidth={2} />
            </span>
          </Link>
        </div>

        <div className={s.tray}>
          {cards.map((c, i) => (
            <article key={c.tier} className={`${s.card} ${s.reveal} ${i === 1 ? s.reveal2 : ""} ${i === 2 ? s.reveal3 : ""}`}>
              <div className={s.cardHead}>
                <span className={s.icon} aria-hidden>
                  <c.icon size={17} strokeWidth={1.9} />
                </span>
                <h3 className={s.name}>{c.name}</h3>
                <span className={s.diff} aria-hidden>
                  {DIFF[c.tier].map(([add, w], j) => (
                    <i key={j} className={add ? s.add : s.del} style={{ width: `${w}%` }} />
                  ))}
                </span>
              </div>
              <p className={s.desc}>{c.desc}</p>

              <div className={s.priceRow}>
                <span className={s.price}>${c.cost.toFixed(2)}</span>
                <span className={s.per}>/review</span>
              </div>
              <p className={s.basis}>
                median of {c.count} runs · {c.seconds.toFixed(1)}s
              </p>

              <ul className={s.list}>
                {SPECIALISTS.map((sp) => {
                  const on = c.runs.includes(sp.key);
                  return (
                    <li key={sp.key} className={on ? s.on : s.off}>
                      <span className={s.tick} aria-hidden>
                        {on ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
                      </span>
                      <span>
                        {sp.label}
                        <span className={s.srOnly}>{on ? " runs" : " does not run"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <Link href={c.href} className={s.button}>
                See a {c.name.toLowerCase()} review
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
