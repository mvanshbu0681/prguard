// Section 9, the footer, rebuilt on the otoma8.com footer: a #0a0a0a card inset
// 12px (radius 28) with the logo and a short line on the left, two link
// columns on the right, a hairline, then a pill with a lime button and the
// copyright. otoma8's pill is a newsletter form; Witness has no newsletter, so
// the same pill opens the demo review's replay instead.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TrackingMark } from "@/components/brand/TrackingMark";
import { getAccuracy, getDemoResult } from "@/lib/fixtures";
import s from "./footer.module.css";

const COLUMNS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: "On this page",
    links: [
      { href: "#proof", label: "Product" },
      { href: "#why", label: "Why Witness" },
      { href: "#pipeline", label: "How it works" },
      { href: "#caught", label: "Proven findings" },
    ],
  },
  {
    label: "Dashboard",
    links: [
      { href: "/overview", label: "Overview" },
      { href: "/findings", label: "Findings" },
      { href: "/accuracy", label: "Accuracy" },
      { href: "/audit", label: "Audit log" },
    ],
  },
];

export function Footer() {
  const result = getDemoResult();
  const accuracy = getAccuracy();
  const repoPr = `${result.repository.name}#${result.pull_request.number}`;
  const seconds = result.timing?.duration_seconds ?? 0;
  const proven = (result.findings ?? []).filter((f) => f.proof?.status === "proven").length;

  return (
    <footer className={s.footer}>
      <div className={s.card}>
        <div className={s.top}>
          <div className={s.brand}>
            <Link href="/" className={s.logo} aria-label="Witness home">
              <TrackingMark size={34} className={s.logoMark} />
              Witness
            </Link>
            <p className={s.blurb}>
              AI code review that proves every claim. A repro test runs at your base and head commit, and only a proven bug
              blocks the merge.
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
          <Link href={`/runs/${result.review_id}?replay=1`} className={s.pill}>
            <span className={s.pillText}>
              <span className={s.pillOwner}>{result.repository.owner}/</span>
              {repoPr}
              <span className={s.pillMeta}>
                {" "}
                · {seconds.toFixed(1)}s · {proven} proven
              </span>
            </span>
            <span className={s.pillBtn}>
              <span className={s.pillLabel}>Replay</span>
              <span className={s.pillChip} aria-hidden>
                <ArrowUpRight size={14} strokeWidth={2.2} />
              </span>
            </span>
          </Link>
          <p className={s.legal}>
            © 2026 Witness. Every number on this page is read from the demo corpus of{" "}
            {accuracy.runs.total ?? 0} reviews.
          </p>
        </div>
      </div>
    </footer>
  );
}
