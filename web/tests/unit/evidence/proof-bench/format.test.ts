// OWNER: t4 (wave 2). Pure derivations: exit codes -> tones, verdict text per status.
import { describe, expect, it } from "vitest";
import {
  CONSEQUENCE_TEXT_CLASS,
  consequence,
  failingPane,
  hasExecution,
  paneBackground,
  paneText,
  paneTone,
  railTone,
  runnerIsolation,
  sha7,
  verdictLeft,
} from "@/components/evidence/ProofBench/format";
import type { FindingProof } from "@/components/evidence/ProofBench/props";

const PASS = { exit_code: 0, excerpt: ".\n1 passed in 0.42s" };
const FAIL = { exit_code: 1, excerpt: "F\n1 failed in 0.39s" };

function proof(overrides: Partial<FindingProof>): FindingProof {
  return {
    status: "proven",
    runner: "docker",
    isolation: "isolated",
    baseline_mode: "compared",
    test_file_path: "tests/test_repro_7e3f1a.py",
    test_code: null,
    command: "pytest -q tests/test_repro_7e3f1a.py",
    base: PASS,
    head: FAIL,
    duration_ms: 1304,
    deps_install_ok: true,
    ...overrides,
  };
}

describe("sha7", () => {
  it("takes the first 7 characters", () => {
    expect(sha7("7c41a09e3b5d2f8a1c6e4b9d7f0a2c5e8b3d6f19")).toBe("7c41a09");
  });
  it("is null for a missing sha", () => {
    expect(sha7(null)).toBeNull();
    expect(sha7(undefined)).toBeNull();
    expect(sha7("")).toBeNull();
  });
});

describe("paneTone / railTone / paneBackground — exit codes drive tones", () => {
  it("exit 0 is signal", () => {
    expect(paneTone(PASS)).toBe("signal");
    expect(railTone("signal")).toBe("signal-lo");
    expect(paneBackground("signal")).toBe("signal-tint-lo");
  });
  it("any non-zero exit is alarm", () => {
    expect(paneTone(FAIL)).toBe("alarm");
    expect(paneTone({ exit_code: 2, excerpt: "" })).toBe("alarm");
    expect(railTone("alarm")).toBe("alarm");
    expect(paneBackground("alarm")).toBe("alarm-tint-lo");
  });
  it("a missing execution has no tone", () => {
    expect(paneTone(null)).toBeNull();
    expect(paneTone(undefined)).toBeNull();
    expect(paneTone({ exit_code: null, excerpt: "" })).toBeNull();
    expect(railTone(null)).toBe("none");
    expect(paneBackground(null)).toBe("default");
  });
});

describe("failingPane", () => {
  it("prefers head when head failed", () => {
    expect(failingPane({ base: PASS, head: FAIL })).toBe("head");
  });
  it("falls back to base when only base failed (disproven-shaped: head passes)", () => {
    expect(failingPane({ base: FAIL, head: PASS })).toBe("base");
  });
  it("is null when both passed (disproven)", () => {
    expect(failingPane({ base: PASS, head: PASS })).toBeNull();
  });
  it("prefers head when both failed (inconclusive)", () => {
    expect(failingPane({ base: FAIL, head: FAIL })).toBe("head");
  });
});

describe("verdictLeft — verdict text per status, derived from exit codes", () => {
  it("proven: passes at base, fails at head", () => {
    expect(verdictLeft(proof({ status: "proven" }))).toBe("PASSES AT BASE · FAILS AT HEAD · PROVEN");
  });
  it("disproven: passes at both", () => {
    expect(verdictLeft(proof({ status: "disproven", base: PASS, head: PASS }))).toBe("PASSES AT BASE · PASSES AT HEAD · DISPROVEN");
  });
  it("inconclusive: fails at both", () => {
    expect(verdictLeft(proof({ status: "inconclusive", base: FAIL, head: FAIL }))).toBe("FAILS AT BASE · FAILS AT HEAD · INCONCLUSIVE");
  });
  it("falls back to the bare state when an exit code is unknown", () => {
    expect(verdictLeft(proof({ status: "not_attempted", base: null, head: null }))).toBe("NOT ATTEMPTED");
    expect(verdictLeft(proof({ status: "skipped_no_env", base: null, head: null }))).toBe("SKIPPED NO ENV");
  });
});

describe("consequence — the verdict rail's right half, per proof_status", () => {
  it("proven + blocking blocks the merge, in alarm", () => {
    expect(consequence("proven", true)).toEqual({ text: "→ blocks merge", tone: "alarm" });
  });
  it("proven, not blocking, is not alarm", () => {
    expect(consequence("proven", false).tone).not.toBe("alarm");
  });
  it("disproven reads refuted, in signal", () => {
    expect(consequence("disproven", false)).toEqual({ text: "refuted by execution · gate stays clear", tone: "signal" });
  });
  it("inconclusive reads advisory, in marker", () => {
    expect(consequence("inconclusive", false)).toEqual({ text: "advisory · a human decides", tone: "marker" });
  });
  it("not_attempted and skipped_no_env read not executed, dim", () => {
    expect(consequence("not_attempted", false)).toEqual({ text: "not executed · advisory", tone: "dim" });
    expect(consequence("skipped_no_env", false)).toEqual({ text: "not executed · advisory", tone: "dim" });
  });
  it("every tone maps to a text colour class", () => {
    for (const tone of Object.keys(CONSEQUENCE_TEXT_CLASS) as (keyof typeof CONSEQUENCE_TEXT_CLASS)[]) {
      expect(CONSEQUENCE_TEXT_CLASS[tone]).toMatch(/^text-/);
    }
  });
});

describe("runnerIsolation", () => {
  it("joins both when present", () => {
    expect(runnerIsolation({ runner: "docker", isolation: "isolated" })).toBe("docker · isolated");
  });
  it("omits a missing half", () => {
    expect(runnerIsolation({ runner: "docker", isolation: null })).toBe("docker");
  });
  it("is null when both are missing", () => {
    expect(runnerIsolation({ runner: null, isolation: null })).toBeNull();
  });
});

describe("hasExecution", () => {
  it("true when base, head and command are all present", () => {
    expect(hasExecution({ base: PASS, head: FAIL, command: "pytest -q x.py" })).toBe(true);
  });
  it("false when the command is missing (not_attempted shape)", () => {
    expect(hasExecution({ base: null, head: null, command: null })).toBe(false);
  });
});

describe("paneText", () => {
  it("prefixes the checkout command and keeps the excerpt", () => {
    expect(paneText("7c41a09", "pytest -q tests/test_repro_7e3f1a.py", PASS)).toBe(
      "$ git checkout 7c41a09 && pytest -q tests/test_repro_7e3f1a.py\n.\n1 passed in 0.42s",
    );
  });
  it("never invents a sha: omits the checkout clause when none is known", () => {
    expect(paneText(null, "pytest -q tests/test_repro_7e3f1a.py", PASS)).toBe("$ pytest -q tests/test_repro_7e3f1a.py\n.\n1 passed in 0.42s");
  });
});
