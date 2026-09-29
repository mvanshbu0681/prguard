// The claim, as Witness posted it: the bot's identity, the specialist and rule
// that raised it, then the body. A refuted claim stays legible but is struck
// through — an evidence page never deletes the claim it is refuting.
import { EyeGlyph } from "@/components/brand/EyeGlyph";
import { Card } from "@/components/dash/kit";
import { humanize } from "@/components/dash/format";
import type { Finding } from "@/lib/api-types";
import { ClaimMarkdown } from "./ClaimMarkdown";
import s from "./detail.module.css";

export function ClaimCard({ finding }: { finding: Finding }) {
  const refuted = finding.proof?.status === "disproven";
  return (
    <Card as="section" tone="panel" pad="lg" className={s.cardBody} aria-label="The claim">
      <div className={s.bot}>
        <span className={s.botMark} aria-hidden>
          <EyeGlyph size={18} />
        </span>
        <div className="min-w-0">
          <p className={s.botName}>witness[bot]</p>
          <p className={s.botMeta}>
            {humanize(finding.specialist)} specialist · <code>{finding.rule_key}</code>
          </p>
        </div>
      </div>
      <div className={s.claimBody} data-refuted={refuted ? "" : undefined}>
        <ClaimMarkdown>{finding.body_markdown}</ClaimMarkdown>
      </div>
    </Card>
  );
}
