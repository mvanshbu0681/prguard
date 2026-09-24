// OWNER: t1c (wave 1). No badge ever leaves a character Google Sans Code lacks to a fallback
// font (plan A15). The visible text of every state is checked; a visually hidden copy of the
// character (for copy-paste and screen readers) is allowed, a painted one is not.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_MODE,
  DeliveryModeChip,
  FINDING_STATUS,
  GateBlock,
  GateChip,
  PROOF_CHIP,
  ProofChip,
  SEVERITY_BANDS,
  STAGE_DOT_SHAPE,
  SeverityMeter,
  StageDot,
  StatusBadge,
} from "@/components/badges";
import type { DeliveryMode, FindingStatus, ProofStatus, StageState } from "@/lib/contracts";

/** Characters verified absent from app/fonts/GoogleSansCode-VF-latin.woff2 (plan A15 + the meter's ▮ ▢). */
const MISSING = /[↻▶▣✓✗Σ⋯‖⚠▮▢]/u;

function visibleText(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement?.closest(".sr-only, title")) out += n.textContent;
  return out;
}

const EVERY_STATE: ReactElement[] = [
  ...(Object.keys(PROOF_CHIP) as ProofStatus[]).flatMap((s) => [<ProofChip key={s} status={s} />, <ProofChip key={`${s}-c`} status={s} caption />]),
  ...(Object.keys(FINDING_STATUS) as FindingStatus[]).map((s) => <StatusBadge key={s} status={s} />),
  ...(Object.keys(DELIVERY_MODE) as DeliveryMode[]).map((m) => <DeliveryModeChip key={m} mode={m} />),
  ...(Object.keys(STAGE_DOT_SHAPE) as StageState[]).map((s) => <StageDot key={s} state={s} />),
  ...SEVERITY_BANDS.flatMap((b) => [<SeverityMeter key={b} score={0.5} band={b} />, <SeverityMeter key={`${b}-g`} score={0.5} band={b} density="glyph" />]),
  ...(["failure", "neutral", "success", null] as const).flatMap((c) => [
    <GateChip key={`chip-${c}`} conclusion={c} />,
    <GateBlock key={`block-${c}`} conclusion={c} blocking={1} delivery="check_run" announce={false} />,
  ]),
];

describe("glyph coverage", () => {
  it("paints no character Google Sans Code lacks, in any state", () => {
    for (const el of EVERY_STATE) {
      const { container, unmount } = render(el);
      const text = visibleText(container);
      expect(text, text).not.toMatch(MISSING);
      unmount();
    }
  });
});
