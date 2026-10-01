// Section 4, rebuilt on the otoma8.com "EXPERTISE" composition: the review
// team as a 2x2 tray of illustrated cards. Each illustration is a pair of
// tilted, floating mini UI cards built from what those reviewers really posted
// on the public sandbox (src/sandbox/snapshot.json).
import { Bug, Check } from "lucide-react";
import type { ReactNode } from "react";
import { CODE_CHECKS, MODEL_REVIEWERS, avatarColor, initialsOf, prLabel, sandbox, type Severity } from "@/sandbox";
import { EyeGlyph } from "@/components/brand/EyeGlyph";
import s from "./team.module.css";

const SEV_SHORT: Record<Severity, string> = { critical: "crit", high: "high", medium: "med", low: "low", nit: "nit" };
const BANDS = ["critical", "high", "medium", "low"] as const;

/** Just enough Python colouring for a short snippet: keywords and strings. */
const highlight = (line: string): ReactNode[] =>
  line.split(/("[^"]*"|\b(?:def|assert|return|import|from)\b)/).map((t, i) =>
    t.startsWith('"') ? (
      <span key={i} className={s.tokStr}>{t}</span>
    ) : /^(def|assert|return|import|from)$/.test(t) ? (
      <span key={i} className={s.tokKw}>{t}</span>
    ) : (
      t
    ),
  );

const SPOTS = [
  { left: "8%", top: "22%" },
  { right: "4%", top: "36%" },
  { right: "14%", bottom: "14%" },
  { left: "6%", bottom: "24%" },
] as const;

export function Team() {
  const t = sandbox.totals;
  const by = sandbox.byReviewer;
  const topBugs = sandbox.topByReviewer.Bug ?? [];

  const secTop = sandbox.featured.find((f) => f.reviewers.includes("Security") && f.severity === "critical" && f.verified);
  const secCounts = sandbox.severityByReviewer.Security ?? {};
  const bandCounts = BANDS.map((b) => secCounts[b] ?? 0);
  const maxBand = Math.max(...bandCounts, 1);
  const hottest = bandCounts.indexOf(maxBand);
  const secPosted = Object.values(secCounts).reduce((a, b) => a + b, 0);

  const fix = sandbox.featured.find((f) => f.suggestion && f.verified) ?? sandbox.featured[0];
  const fixLines = (fix.suggestion ?? "").split("\n").slice(0, 4);
  const fixPct = Math.round((t.withSuggestion / t.findings) * 100);

  // The four reviewers that posted the most, around the PR Guard eye.
  const people = Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SPOTS.length)
    .map(([name, count], i) => ({ name, count, initials: initialsOf(name), color: avatarColor(name), style: SPOTS[i] }));

  return (
    <section id="team" className={s.section} aria-labelledby="team-title">
      <div className={s.inner}>
        <div className={`${s.head} ${s.reveal}`}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>The review team
          </p>
          <h2 id="team-title" className={s.h2}>
            <span>Twelve reviewers.</span>
            <span>One review.</span>
          </h2>
          <p className={s.sub}>
            {MODEL_REVIEWERS} AI reviewers and {CODE_CHECKS} code checks. Triage sends each file to the ones that matter, and what they find merges into one review on the pull request.
          </p>
        </div>

        <div className={s.tray}>
          {/* 1. bugs and reliability */}
          <article className={`${s.card} ${s.reveal}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltA}`} style={{ left: "calc(50% - 212px)", top: 64, width: 172, padding: 16, ["--r" as string]: "-6deg" }}>
                <div className={s.float}>
                  <span className={s.miniLabel}>Bug</span>
                  <div className={s.miniSub}>findings in the sandbox</div>
                  <span className={s.miniBig} style={{ marginTop: 18 }}>
                    {by.Bug ?? 0}
                  </span>
                  <div className={s.miniSub} style={{ marginTop: 6 }}>
                    Reliability: {by.Reliability ?? 0}
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltB}`} style={{ left: "calc(50% - 44px)", top: 92, width: 256, padding: 14, ["--r" as string]: "2deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <span className={s.miniLabel}>Top Bug findings</span>
                  <div className={s.miniSub}>most severe first</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, marginTop: 10 }}>
                    {topBugs.map((f) => (
                      <div key={f.url} className={s.row}>
                        <span className={s.rowIcon}>
                          <Bug size={11} strokeWidth={2.2} />
                        </span>
                        <span className={s.rowText}>{f.title.replace(/`/g, "")}</span>
                        <span className={s.score}>{f.severity ? SEV_SHORT[f.severity] : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Bugs &amp; reliability</h3>
            <p className={s.desc}>
              Wrong conditions, null paths, swallowed errors, races and leaks. {by.Bug ?? 0} Bug and {by.Reliability ?? 0} Reliability findings posted in the sandbox.
            </p>
          </article>

          {/* 2. security */}
          <article className={`${s.card} ${s.reveal} ${s.reveal2}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltA}`} style={{ left: "calc(50% - 222px)", top: 70, width: 214, padding: 16, ["--r" as string]: "-5deg" }}>
                <div className={s.float}>
                  <span className={`${s.pill} ${s.pillLime}`}>{secTop?.severity ?? ""}</span>
                  <p style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{secTop?.title?.replace(/`/g, "")}</p>
                  <div className={s.miniSub} style={{ marginTop: 10, fontFamily: "var(--font-v2-mono)" }}>
                    {secTop ? `${prLabel(secTop.repo, secTop.pr)} · verified` : ""}
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltB}`} style={{ left: "calc(50% - 16px)", top: 96, width: 228, padding: 14, ["--r" as string]: "3deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <span className={s.miniLabel}>Security by severity</span>
                  <div className={s.miniSub}>{secPosted} posted in the sandbox</div>
                  <div className={s.bars}>
                    {BANDS.map((b, i) => (
                      <div key={b} className={s.barCol}>
                        <span className={`${s.bar} ${i === hottest ? s.barHot : ""}`} style={{ height: 12 + (bandCounts[i] / maxBand) * 72 }} />
                        <span className={s.barLabel}>{SEV_SHORT[b]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Security &amp; secrets</h3>
            <p className={s.desc}>
              Missing access checks, injection, unsafe input and data exposure, plus a Secrets check that flags committed keys without repeating them.
            </p>
          </article>

          {/* 3. quality and fixes */}
          <article className={`${s.card} ${s.reveal}`}>
            <div className={`${s.stage} ${s.stageTall}`} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltA}`} style={{ left: "calc(50% - 216px)", top: 96, width: 244, padding: 14, ["--r" as string]: "-3deg" }}>
                <div className={s.float}>
                  <span className={s.miniLabel}>Committable fixes</span>
                  <div className={s.miniSub}>findings with a suggestion block</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
                    <span className={s.miniBig}>{fixPct}%</span>
                    <span className={`${s.pill} ${s.pillLime}`}>
                      {t.withSuggestion} of {t.findings}
                    </span>
                  </div>
                  <div className={s.chips}>
                    {["AI slop", "Team rules", "Test gap"].map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltB}`} style={{ left: "calc(50% - 40px)", top: 56, width: 260, padding: 14, ["--r" as string]: "4deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <div className={s.codeBar}>
                    <span className={s.dots}>
                      <i style={{ background: "#fca5a5" }} />
                      <i style={{ background: "#fdba74" }} />
                      <i style={{ background: "#cbf857" }} />
                    </span>
                    <span className={s.codeFile}>
                      {fix.path.split("/").pop()}:{fix.line}
                    </span>
                  </div>
                  <div className={s.code}>
                    {fixLines.map((line, i) => (
                      <div key={i}>{highlight(line.trim())}</div>
                    ))}
                  </div>
                  <div className={s.runs}>
                    <span className={`${s.run} ${s.runPass}`}>
                      <Check size={10} strokeWidth={3} />
                      suggestion
                    </span>
                    {fix.verified ? (
                      <span className={`${s.run} ${s.runPass}`}>
                        <Check size={10} strokeWidth={3} />
                        verified
                      </span>
                    ) : null}
                    <span className={s.runBy}>PR #{fix.pr}</span>
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Quality &amp; fixes</h3>
            <p className={s.desc}>
              AI slop, Team rules, Test gap and Docs drift catch what a linter can&rsquo;t, and {fixPct}% of findings come with a fix you can commit from the pull request.
            </p>
          </article>

          {/* 4. one review */}
          <article className={`${s.card} ${s.reveal} ${s.reveal2}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              {[300, 220, 140].map((d) => (
                <span key={d} className={s.orbit} style={{ width: d, height: d }} />
              ))}
              <span className={s.core}>
                <EyeGlyph size={30} />
              </span>
              {people.map((p) => (
                <span key={p.name} className={s.person} style={p.style}>
                  <span className={s.avatar} style={{ background: p.color }}>
                    {p.initials}
                  </span>
                  <b>{p.name}</b>
                  <span className={s.count}>{p.count}</span>
                </span>
              ))}
              </div>
            </div>
            <h3 className={s.title}>One review, never an approval</h3>
            <p className={s.desc}>
              {t.reviews} reviews on {t.pullRequestsReviewed} pull requests, all posted as comments. When two reviewers flag the same issue, it posts once with both badges.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
