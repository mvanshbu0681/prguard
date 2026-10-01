// Section 9, the footer, rebuilt on the otoma8.com footer: a #0a0a0a card inset
// 12px (radius 28) with the logo and a short line on the left, two link
// columns on the right, a hairline, then a pill with a lime button and the
// copyright. otoma8's pill is a newsletter form; PR Guard has no newsletter, so
// the same pill opens a real review on the public sandbox instead.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrackingMark } from "@/components/brand/TrackingMark";
import { APP_URL, CODE_CHECKS, MODEL_REVIEWERS, sandbox, snapshotDate } from "@/sandbox";
import s from "./footer.module.css";

const ignore = sandbox.commands.asked.find((a) => a.command.startsWith("@prguard ignore"));

const COLUMNS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: "On this page",
    links: [
      { href: "#proof", label: "Product" },
      { href: "#why", label: "Why PR Guard" },
      { href: "#pipeline", label: "How it works" },
      { href: "#caught", label: "Real findings" },
    ],
  },
  {
    label: "On GitHub",
    links: [
      { href: APP_URL, label: "Install the App" },
      { href: sandbox.orgUrl, label: "Public sandbox" },
      { href: sandbox.showcase.url, label: "Example review" },
      { href: ignore?.url ?? sandbox.commands.url, label: "Commands in use" },
    ],
  },
];

export function Footer() {
  const show = sandbox.showcase;
  const repoPr = `${show.repo}#${show.pr}`;

  return (
    <footer className={s.footer}>
      <div className={s.card}>
        <div className={s.top}>
          <div className={s.brand}>
            <Link href="/" className={s.logo} aria-label="PR Guard home">
              <TrackingMark size={34} className={s.logoMark} />
              PR Guard
            </Link>
            <p className={s.blurb}>
              AI code review as a GitHub App. {MODEL_REVIEWERS} AI reviewers and {CODE_CHECKS} code checks comment on every pull request, and a
              person still approves the merge.
            </p>
          </div>

          <nav className={s.columns} aria-label="Footer">
            {COLUMNS.map((col) => (
              <ul key={col.label} className={s.column} aria-label={col.label}>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={s.link}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </nav>
        </div>

        <div className={s.bottom}>
          <p className={s.label}>See it on a real pull request</p>
          <Link href={show.url} className={s.pill}>
            <span className={s.pillText}>
              <span className={s.pillOwner}>{sandbox.org}/</span>
              {repoPr}
              <span className={s.pillMeta}>
                {" "}
                · {show.findings.length} findings · {show.priority?.alt.split(" ")[0]}
              </span>
            </span>
            <span className={s.pillBtn}>
              <span className={s.pillLabel}>Open</span>
              <span className={s.pillChip} aria-hidden>
                <ArrowUpRight size={14} strokeWidth={2.2} />
              </span>
            </span>
          </Link>
          <p className={s.legal}>
            © 2026 PR Guard. Sandbox counts are read from GitHub on {snapshotDate()}: {sandbox.totals.reviews} reviews by {sandbox.bot} on{" "}
            {sandbox.totals.pullRequestsReviewed} public pull requests.
          </p>
        </div>
      </div>
    </footer>
  );
}
