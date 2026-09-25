// Section 4, rebuilt on the otoma8.com "EXPERTISE" composition: the four
// specialists as a 2x2 tray of illustrated cards. Each illustration is a pair
// of tilted, floating mini UI cards built from that specialist's real findings.
import { Bug, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { getAccuracy, getDemoProvenFinding, getFindings } from "@/lib/fixtures";
import type { Finding } from "@/lib/api-types";
import s from "./team.module.css";

const score = (f: Finding) => f.severity?.score ?? 0;
const bySpecialist = (all: Finding[], name: string) => all.filter((f) => f.specialist === name);
const fmt = (n: number) => n.toFixed(3);
const BAND_SHORT = { critical: "crit", high: "high", medium: "med", low: "low", info: "info" } as const;

/** The last test function of a repro file, up to its first blank line. */
const lastTest = (code: string) => {
  const lines = code.split("\n");
  const at = lines.findLastIndex((l) => l.startsWith("def test_"));
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && l.trim() === "");
  return lines.slice(at, end < 0 ? undefined : end).slice(0, 4);
};

/** Just enough Python colouring for a three-line snippet: keywords and strings. */
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

const PEOPLE = [
  { key: "bugs", initials: "BG", color: "#1f2937", style: { left: "8%", top: "22%" } },
  { key: "security", initials: "SC", color: "#475569", style: { right: "4%", top: "36%" } },
  { key: "tests", initials: "TS", color: "#334155", style: { right: "14%", bottom: "14%" } },
  { key: "quality", initials: "QA", color: "#57534e", style: { left: "6%", bottom: "24%" } },
] as const;

export function Team() {
  const all = getFindings();
  const accuracy = getAccuracy();

  const bugs = bySpecialist(all, "bugs");
  const bugsPublished = bugs.filter((f) => f.status === "published");
  const bugsProven = bugs.filter((f) => f.proof?.status === "proven").length;
  const topBugs = [...bugsPublished].sort((a, b) => score(b) - score(a)).slice(0, 3);

  const sec = bySpecialist(all, "security");
  const secPublished = sec.filter((f) => f.status === "published");
  const secProven = sec.filter((f) => f.proof?.status === "proven").length;
  const topSec = [...secPublished].sort((a, b) => score(b) - score(a))[0];
  const bands = ["critical", "high", "medium", "low", "info"] as const;
  const bandCounts = bands.map((b) => sec.filter((f) => f.status !== "dropped" && f.severity?.band === b).length);
  const maxBand = Math.max(...bandCounts, 1);
  const hottest = bandCounts.indexOf(maxBand);

  const noisy = [...bySpecialist(all, "tests"), ...bySpecialist(all, "quality")];
  const noisyDropped = noisy.filter((f) => f.status === "dropped");
  const droppedPct = noisy.length ? Math.round((noisyDropped.length / noisy.length) * 100) : 0;
  const ruleCounts = new Map<string, number>();
  for (const f of noisyDropped) ruleCounts.set(f.rule_key, (ruleCounts.get(f.rule_key) ?? 0) + 1);
  const topRules = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  const proof = getDemoProvenFinding().proof;
  const testFile = (proof?.test_file_path ?? "").split("/").pop();
  const testLines = lastTest(proof?.test_code ?? "");
  const runs = [
    { at: "base", ok: proof?.base?.exit_code === 0 },
    { at: "head", ok: proof?.head?.exit_code === 0 },
  ];

  const counts = Object.fromEntries(PEOPLE.map((p) => [p.key, bySpecialist(all, p.key).length]));
  const raised = accuracy.findings.proposed ?? 0;
  const published = accuracy.findings.published ?? 0;
  const perReview = fmt(accuracy.findings.per_review_published_mean ?? 0);

  return (
    <section id="team" className={s.section} aria-labelledby="team-title">
      <div className={s.inner}>
        <div className={`${s.head} ${s.reveal}`}>
          <p className={s.eyebrow}>
            <span aria-hidden>•</span>The review team
          </p>
          <h2 id="team-title" className={s.h2}>
            <span>Four specialists.</span>
            <span>One coordinated review.</span>
          </h2>
          <p className={s.sub}>
            Bugs, security, tests and quality run in parallel on every pull request. A coordinator merges them and drops the noise before anything reaches you.
          </p>
        </div>

        <div className={s.tray}>
          {/* 1. bugs */}
          <article className={`${s.card} ${s.reveal}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltA}`} style={{ left: "calc(50% - 212px)", top: 64, width: 172, padding: 16, ["--r" as string]: "-6deg" }}>
                <div className={s.float}>
                  <span className={s.miniLabel}>Proven by execution</span>
                  <div className={s.miniSub}>bugs with a failing test</div>
                  <span className={s.miniBig} style={{ marginTop: 18 }}>
                    {bugsProven}
                  </span>
                  <div className={s.miniSub} style={{ marginTop: 6 }}>
                    of {bugsPublished.length} published
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltB}`} style={{ left: "calc(50% - 44px)", top: 92, width: 256, padding: 14, ["--r" as string]: "2deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <span className={s.miniLabel}>Top bugs</span>
                  <div className={s.miniSub}>by computed severity</div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, marginTop: 10 }}>
                    {topBugs.map((f) => (
                      <div key={f.id} className={s.row}>
                        <span className={s.rowIcon}>
                          <Bug size={11} strokeWidth={2.2} />
                        </span>
                        <span className={s.rowText}>{f.title}</span>
                        <span className={s.score}>{fmt(score(f))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Bugs &amp; correctness</h3>
            <p className={s.desc}>
              Null dereferences, money rounding and broken contracts. {bugsPublished.length} published, {bugsProven} of them proven with a failing test.
            </p>
          </article>

          {/* 2. security */}
          <article className={`${s.card} ${s.reveal} ${s.reveal2}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltA}`} style={{ left: "calc(50% - 222px)", top: 70, width: 214, padding: 16, ["--r" as string]: "-5deg" }}>
                <div className={s.float}>
                  <span className={`${s.pill} ${s.pillLime}`}>{topSec?.severity?.band ?? ""}</span>
                  <p style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{topSec?.title}</p>
                  <div className={s.miniSub} style={{ marginTop: 10, fontFamily: "var(--font-v2-mono)" }}>
                    severity {fmt(topSec ? score(topSec) : 0)}
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltB}`} style={{ left: "calc(50% - 16px)", top: 96, width: 228, padding: 14, ["--r" as string]: "3deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <span className={s.miniLabel}>Security by severity</span>
                  <div className={s.miniSub}>{sec.length} raised · {secPublished.length} published</div>
                  <div className={s.bars}>
                    {bands.map((b, i) => (
                      <div key={b} className={s.barCol}>
                        <span className={`${s.bar} ${i === hottest ? s.barHot : ""}`} style={{ height: 12 + (bandCounts[i] / maxBand) * 72 }} />
                        <span className={s.barLabel}>{BAND_SHORT[b]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Security</h3>
            <p className={s.desc}>
              Token handling, auth gaps and exposed data, ranked by how reachable the code path really is. {secPublished.length} published, {secProven} proven.
            </p>
          </article>

          {/* 3. tests & quality */}
          <article className={`${s.card} ${s.reveal}`}>
            <div className={`${s.stage} ${s.stageTall}`} aria-hidden>
              <div className={s.art}>
              <div className={`${s.mini} ${s.miniWhite} ${s.tiltA}`} style={{ left: "calc(50% - 236px)", top: 112, width: 244, padding: 14, ["--r" as string]: "-3deg" }}>
                <div className={s.float}>
                  <span className={s.miniLabel}>Dropped as noise</span>
                  <div className={s.miniSub}>tests and quality suggestions</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
                    <span className={s.miniBig}>{droppedPct}%</span>
                    <span className={`${s.pill} ${s.pillLime}`}>
                      {noisyDropped.length} of {noisy.length}
                    </span>
                  </div>
                  <div className={s.chips}>
                    {topRules.map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${s.mini} ${s.miniDark} ${s.tiltB}`} style={{ left: "calc(50% - 24px)", top: 26, width: 260, padding: 14, ["--r" as string]: "4deg" }}>
                <div className={`${s.float} ${s.float2}`}>
                  <div className={s.codeBar}>
                    <span className={s.dots}>
                      <i style={{ background: "#fca5a5" }} />
                      <i style={{ background: "#fdba74" }} />
                      <i style={{ background: "#cbf857" }} />
                    </span>
                    <span className={s.codeFile}>{testFile}</span>
                  </div>
                  <div className={s.code}>
                    {testLines.map((line, i) => (
                      <div key={i}>{highlight(line)}</div>
                    ))}
                  </div>
                  <div className={s.runs}>
                    {runs.map((r) => (
                      <span key={r.at} className={`${s.run} ${r.ok ? s.runPass : s.runFail}`}>
                        {r.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
                        {r.at} {r.ok ? "passed" : "failed"}
                      </span>
                    ))}
                    <span className={s.runBy}>{((proof?.duration_ms ?? 0) / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              </div>
              </div>
            </div>
            <h3 className={s.title}>Tests &amp; quality</h3>
            <p className={s.desc}>
              PRGuard writes the repro test itself. Suggestions face the same bar: {noisyDropped.length} of {noisy.length} were dropped as noise before anyone read them.
            </p>
          </article>

          {/* 4. the coordinator */}
          <article className={`${s.card} ${s.reveal} ${s.reveal2}`}>
            <div className={s.stage} aria-hidden>
              <div className={s.art}>
              {[300, 220, 140].map((d) => (
                <span key={d} className={s.orbit} style={{ width: d, height: d }} />
              ))}
              <span className={s.core}>
                <i />
                <i />
              </span>
              {PEOPLE.map((p) => (
                <span key={p.key} className={s.person} style={p.style}>
                  <span className={s.avatar} style={{ background: p.color }}>
                    {p.initials}
                  </span>
                  <b>{p.key}</b>
                  <span className={s.count}>{counts[p.key]}</span>
                </span>
              ))}
              </div>
            </div>
            <h3 className={s.title}>One coordinated review</h3>
            <p className={s.desc}>
              {raised} findings raised, {published} published: about {perReview} per pull request, merged into one comment and never an approval.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
