// The four precision proxies, each tone meaning something:
//   sky photograph — the human verdict (dismissal rate), the most telling
//                    number here, so it is the hero; one dot per published
//                    finding, the dismissed ones filled.
//   lime           — verified by execution: claims Witness refuted itself.
//   ink            — the outcome downstream: findings that were fixed.
//   hairline strip — true by construction: execution-verified precision is
//                    1.0 because a refuted claim is never published, so it is
//                    stated plainly on one line rather than celebrated.
// Every rate shows its value, n in plain words and a Wilson 95% interval. The
// API's own definitions live in one "How these are computed" disclosure.
import { ChevronDown, Info, Users } from "lucide-react";
import { Card, GlassTile, PhotoCard, Tag } from "@/components/dash/kit";
import { cn } from "@/lib/utils";
import type { AccuracyReport } from "@/lib/api-types";
import { intervalText, proxy, ratio, type Proxy } from "./derive";
import s from "./accuracy.module.css";

type Tone = "default" | "tile" | "lime" | "ink";

/** A 0–1 track: the pale band is the 95% interval, the dot is the rate. */
export function Interval({ p, tone = "default", name }: { p: Proxy; tone?: Tone; name: string }) {
  const pc = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
  const label = p.ci ? `${name}: ${ratio(p.value)}, 95% interval ${ratio(p.ci.low)} to ${ratio(p.ci.high)}, n = ${p.n}` : `${name}: no data`;
  return (
    <div className={s.iv} data-tone={tone} role="img" aria-label={label}>
      <span className={s.ivTrack} />
      {[0, 0.5, 1].map((t) => (
        <span key={t} className={s.ivTick} style={{ left: pc(t) }} />
      ))}
      {p.ci ? <span className={s.ivBand} style={{ left: pc(p.ci.low), width: pc(p.ci.high - p.ci.low) }} /> : null}
      {p.value != null ? <span className={s.ivDot} style={{ left: pc(p.value) }} /> : null}
    </div>
  );
}

export function ProxyBento({ report }: { report: AccuracyReport }) {
  const pp = report.precision_proxies;
  const evp = proxy(pp.execution_verified_precision);
  const self = proxy(pp.self_caught_false_positive_rate);
  const dismiss = proxy(pp.human_dismissal_rate);
  const addressed = proxy(pp.addressed_rate);
  const dots = Math.min(dismiss.n, 240);
  const cell = dots <= 120 ? 13 : dots <= 180 ? 10 : 7;

  const defs: [string, Proxy][] = [
    ["Human dismissal rate", dismiss],
    ["Self-caught false positives", self],
    ["Addressed rate", addressed],
    ["Execution-verified precision", evp],
  ];

  return (
    <div className={s.proxies}>
      <section className={s.bento} aria-label="Precision proxies">
        {/* The hero: what people did with what it published */}
        <PhotoCard as="article" className={s.hero} position="50% 70%" zoom sizes="(max-width: 900px) 100vw, 55vw">
          <div className={s.photoTop}>
            <Tag tone="glass" icon={Users}>
              Checked by people
            </Tag>
          </div>
          <GlassTile tone="white" className={s.heroTile}>
            <div className={s.heroText}>
              <p className={s.cardLabel}>Human dismissal rate</p>
              <span className={s.bigValue}>{ratio(dismiss.value)}</span>
              <p className={s.meaning}>
                {dismiss.n
                  ? `Reviewers dismissed ${dismiss.k} of the ${dismiss.n} findings it published. Lower is better; this is the nearest thing here to a false-positive rate a human confirmed.`
                  : "Nothing published in this window yet."}
              </p>
            </div>
            {dots > 0 ? (
              <div className={s.heroDots}>
                <div
                  className={s.units}
                  style={{ ["--cell" as string]: `${cell}px` }}
                  role="img"
                  aria-label={`${dismiss.k} of ${dismiss.n} published findings dismissed by a reviewer`}
                >
                  {Array.from({ length: dots }, (_, i) => (
                    <i key={i} data-on={i < dismiss.k ? "" : undefined} />
                  ))}
                </div>
                <div className={s.unitsKey} aria-hidden>
                  <span>
                    <i data-on="" />
                    <b>{dismiss.k}</b> dismissed
                  </span>
                  <span>
                    <i />
                    <b>{dismiss.n - dismiss.k}</b> kept
                  </span>
                </div>
              </div>
            ) : null}
            <div className={s.heroInterval}>
              <Interval p={dismiss} tone="tile" name="Human dismissal rate" />
              <p className={s.caption}>{intervalText(dismiss)}</p>
            </div>
          </GlassTile>
        </PhotoCard>

        <div className={s.stack}>
          <Card as="article" tone="lime" pad="lg" className={cn(s.stackCard, s.onLime)}>
            <p className={s.cardLabel}>Self-caught false positives</p>
            <span className={cn(s.bigValue, s.midValue)}>{ratio(self.value)}</span>
            <Interval p={self} tone="lime" name="Self-caught false-positive rate" />
            <p className={s.caption}>{intervalText(self)}</p>
            <p className={cn(s.meaning, s.push)}>
              {self.n ? `${self.k} of ${self.n} proof attempts refuted its own claim, before anyone saw it.` : "No proof was attempted in this window."}
            </p>
          </Card>
          <Card as="article" tone="ink" pad="lg" className={cn(s.stackCard, s.onInk)}>
            <p className={s.cardLabel}>Addressed rate</p>
            <span className={cn(s.bigValue, s.midValue)}>{ratio(addressed.value)}</span>
            <Interval p={addressed} tone="ink" name="Addressed rate" />
            <p className={s.caption}>{intervalText(addressed)}</p>
            <p className={cn(s.meaning, s.push)}>
              {addressed.n
                ? `${addressed.k} of ${addressed.n} findings on re-reviewed PRs were gone on the next run: most likely fixed.`
                : "No PR was reviewed twice in this window."}
            </p>
          </Card>
        </div>
      </section>

      {/* True by construction: said once, plainly */}
      <Card as="article" tone="panel" pad="md" className={s.evp} aria-label="Execution-verified precision">
        <p className={s.evpLabel}>Execution-verified precision</p>
        <span className={s.evpValue}>{ratio(evp.value)}</span>
        <div className={s.evpBar}>
          <Interval p={evp} name="Execution-verified precision" />
        </div>
        <p className={s.evpNote}>
          {evp.value == null || evp.n === 0
            ? "Nothing executed and published in this window yet."
            : evp.value >= 1
              ? `All ${evp.n} held up. That is true by construction, since a claim Witness refutes is never published, so on ${evp.n} findings the honest reading is “at least ${ratio(evp.ci?.low)}”.`
              : `${evp.k} of ${evp.n} executed, published findings held up when run. ${intervalText(evp)}.`}
        </p>
      </Card>

      <details className={s.how}>
        <summary>
          <Info size={15} strokeWidth={1.9} aria-hidden />
          How these are computed
          <ChevronDown size={15} strokeWidth={1.9} className={s.howChevron} aria-hidden />
        </summary>
        <dl className={s.howList}>
          {defs.map(([name, p]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <code>{p.definition}</code>
                <span>{p.n ? `n = ${p.n}` : "no data"}</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
