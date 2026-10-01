import { z } from "zod";
import { structured, type CallMeta } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { estimateTokens, renderFile, type FileDiff } from "./diff.ts";
import type { RawFinding } from "./findings.ts";

const schema = z.object({ tests: z.array(z.string()) });

const SYSTEM = `You write the tests a reviewer suggests for untested behavior in a pull request.
Return 3 to 5 tests. Each is one short sentence: the input or situation, then the expected result.
Name functions, values and errors from the diff in backticks. No test code, no numbering.`;

/**
 * A Test gap finding always carries "Suggested tests". The reviewer sometimes spends its steps on
 * tools and answers without them; one small call writes them from the finding and its file.
 */
export async function withSuggestedTests(raw: RawFinding[], files: FileDiff[], meta: Omit<CallMeta, "purpose" | "role">): Promise<RawFinding[]> {
  const gap = raw.find((f) => f.reviewer === "tests" && !(f.details?.title.trim() && f.details.body.trim()));
  if (!gap) return raw;
  const file = files.find((f) => f.path === gap.path);
  let diff = file ? renderFile(file) : "";
  if (estimateTokens(diff) > 6000) diff = diff.slice(0, 24000);
  try {
    const out = await structured({
      ...meta,
      purpose: "test-plan",
      role: "fast",
      system: SYSTEM,
      prompt: `Untested behavior in \`${gap.path}\`: ${gap.title}\n${gap.body}\n\n${diff}`,
      schema,
    });
    const tests = out.tests.map((t) => t.trim().replace(/^[-*\d.)\s]+/, "")).filter(Boolean).slice(0, 5);
    if (!tests.length) return raw;
    const details = { title: "Suggested tests", body: tests.map((t) => `- ${t}`).join("\n") };
    return raw.map((f) => (f === gap ? { ...f, details } : f));
  } catch (err) {
    log.warn({ err: errMessage(err) }, "could not write suggested tests");
    return raw;
  }
}
