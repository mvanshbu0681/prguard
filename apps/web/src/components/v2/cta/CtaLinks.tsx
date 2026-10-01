// The run band's call to action, in the old run form's glass pill: the PR Guard
// GitHub App's address with the lime "Install on GitHub" button inside it, and
// real sandbox reviews below. Every link opens the real thing on GitHub.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import s from "./cta.module.css";

export function CtaLinks({ appUrl, reviews }: { appUrl: string; reviews: { label: string; url: string }[] }) {
  return (
    <div className={s.form}>
      <div className={s.field}>
        <span className={s.input} style={{ display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {appUrl.replace(/^https:\/\//, "")}
        </span>
        <Link href={appUrl} className={s.go}>
          Install on GitHub
          <span className={s.goChip} aria-hidden>
            <ArrowUpRight size={18} strokeWidth={2} />
          </span>
        </Link>
      </div>
      <div className={s.tryRow}>
        <span className={s.tryLabel}>See</span>
        {reviews.map((r) => (
          <Link key={r.url} href={r.url} className={s.try}>
            {r.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
