// Where it lives: the file and the reported lines, the symbol, the diff side,
// and a link to those exact lines at the head commit. The API serves no
// source text for the file, so the page links to it instead of inventing an
// excerpt; the code this page shows is the repro test Witness actually ran.
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/dash/kit";
import { sha } from "@/components/dash/format";
import type { Finding, ReviewResult } from "@/lib/api-types";
import { githubBlobUrl } from "./format";
import s from "./detail.module.css";

export function LocationCard({ finding, review }: { finding: Finding; review: ReviewResult | undefined }) {
  const { file_path, start_line, end_line, symbol_path, side, language } = finding.location;
  const i = file_path.lastIndexOf("/");
  const dir = i === -1 ? "" : file_path.slice(0, i + 1);
  const base = i === -1 ? file_path : file_path.slice(i + 1);
  const lines = start_line == null ? null : end_line != null && end_line !== start_line ? `${start_line}–${end_line}` : String(start_line);
  const headSha = review?.pull_request.head_sha;
  const href = review && headSha ? githubBlobUrl(review.repository.owner, review.repository.name, headSha, file_path, start_line, end_line) : null;
  const symbol = symbol_path?.includes("::") ? symbol_path.split("::").pop() : symbol_path;

  return (
    <Card as="section" tone="panel" pad="lg" className={s.cardBody} aria-labelledby="location-title">
      <div className={s.cardHead}>
        <h2 id="location-title" className={s.cardTitle}>
          Where it lives
        </h2>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer noopener" className={s.inlineLink}>
            {headSha ? `View at ${sha(headSha)}` : "View on GitHub"} <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
          </a>
        ) : null}
      </div>
      <p className={s.path}>
        <span className={s.pathDir}>{dir}</span>
        <span>{base}</span>
        {lines ? <span className={s.pathLines}>{lines.includes("–") ? `lines ${lines}` : `line ${lines}`}</span> : null}
      </p>
      <dl className={s.defs}>
        <div className={s.def}>
          <dt className={s.label}>Symbol</dt>
          <dd className={s.ddMono}>{symbol ? `${symbol}()` : "—"}</dd>
        </div>
        <div className={s.def}>
          <dt className={s.label}>Side of the diff</dt>
          <dd>{side === "RIGHT" ? "Head (added or changed)" : side === "LEFT" ? "Base (removed)" : "—"}</dd>
        </div>
        <div className={s.def}>
          <dt className={s.label}>Language</dt>
          <dd>{language ? language.replace(/^\w/, (c) => c.toUpperCase()) : "—"}</dd>
        </div>
      </dl>
    </Card>
  );
}
