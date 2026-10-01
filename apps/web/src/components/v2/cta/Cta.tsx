// Section 8, rebuilt on the otoma8.com "CONTACT" composition: a photographic
// band inset 12px from the page edge, a left-to-right shade, a trust row, a
// 52/500 heading and the lime pill. Here the pill installs the PR Guard GitHub
// App (the hero's install buttons and the nav point at the same App), with real
// sandbox reviews linked below it.
import Image from "next/image";
import { APP_URL, avatarColor, initialsOf, prLabel, sandbox } from "@/sandbox";
import { CtaLinks } from "./CtaLinks";
import s from "./cta.module.css";

const TRUST = ["Bug", "Security", "Reliability", "Team rules"];

/** The showcase review first, then the Go and Java pull requests the featured findings come from. */
function reviewLinks(): { label: string; url: string }[] {
  const out = [{ label: prLabel(sandbox.showcase.repo, sandbox.showcase.pr), url: sandbox.showcase.url }];
  for (const f of sandbox.featured) {
    if (out.length >= 3) break;
    const label = prLabel(f.repo, f.pr);
    if (out.some((o) => o.label === label) || f.repo === sandbox.showcase.repo) continue;
    out.push({ label, url: f.url.replace(/#.*$/, "") });
  }
  return out;
}

export function Cta() {
  const t = sandbox.totals;

  return (
    <section id="run" className={s.section} aria-labelledby="run-title">
      <div className={s.band}>
        <Image src="/marketing/cta-grass.jpg" alt="" fill sizes="100vw" className={s.photo} />
        <span className={s.shade} aria-hidden />

        <div className={`${s.content} ${s.reveal}`}>
          <div className={s.trust}>
            <span className={s.avatars} aria-hidden>
              {TRUST.map((name) => (
                <span key={name} style={{ background: avatarColor(name) }}>
                  {initialsOf(name)}
                </span>
              ))}
            </span>
            <p className={s.trustText}>
              {t.reviews} reviews on {t.pullRequestsReviewed} public sandbox pull requests
            </p>
          </div>

          <h2 id="run-title" className={s.h2}>
            <span>It comments.</span>
            <span>You approve.</span>
          </h2>
          <p className={s.sub}>
            Install the PR Guard GitHub App on a repository and it reviews every pull request and every new push. It never approves or blocks a merge.
          </p>

          <CtaLinks appUrl={APP_URL} reviews={reviewLinks()} />
        </div>
      </div>
    </section>
  );
}
