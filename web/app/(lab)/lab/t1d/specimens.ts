// OWNER: t1d (wave 1). Specimens for /lab/t1d.
//
// The proof panes reproduce landing §01 byte for byte (column counts included), with the
// base SHA per plan A10. Every identifier comes from public/fixtures/manifest.json, the
// binding ids (A10): nothing that the corpus provides is typed here. The code and diff
// bodies are specimen source for the components, not product data.
import manifest from "@fixtures/manifest.json";
import type { DiffHighlight } from "@/components/code";

const { ids } = manifest;

export const BASE = ids.base_sha.slice(0, 7); // 7c41a09
export const HEAD = ids.head_sha.slice(0, 7); // 9c2d4b1
export const REPRO = ids.repro_test_path; // tests/test_repro_7e3f1a.py
export const TEST = ids.failing_test; // test_charge_uses_account_currency
export const FINDING = ids.proven_finding_id.slice(0, 8); // a91f3c2e
export const DISPROVEN = ids.disproven_finding_id.slice(0, 8);
export const REVIEW = ids.demo_review_id.slice(0, 7); // 4e8b1d0

/** pytest -q progress line: the result glyph, then [100%] at column 58 (landing §01). */
const progress = (glyph: string) => `${glyph}${" ".repeat(56)}[100%]`;

/** Landing §01, pane A. */
export const BASE_PANE = [
  `$ git checkout ${BASE} && pytest -q ${REPRO}`,
  progress("."),
  "1 passed in 0.42s",
].join("\n");

/** Landing §01, pane B: the full traceback. */
export const HEAD_PANE = [
  `$ git checkout ${HEAD} && pytest -q ${REPRO}`,
  progress("F"),
  `${"=".repeat(35)} FAILURES ${"=".repeat(35)}`,
  `${"_".repeat(21)} ${TEST} ${"_".repeat(22)}`,
  `    def ${TEST}():`,
  `        acct = resolve_account("acct_7f31")`,
  `>       assert charge(acct, 1200).currency == "usd"`,
  `E       AttributeError: 'NoneType' object has no attribute 'currency'`,
  `${REPRO}:41: AttributeError`,
  "1 failed in 0.39s",
].join("\n");

/** Landing §01, the `D` counter-demo: the head run passes. The manifest names no repro
 *  path for the disproven finding; this specimen derives one from its id. */
export const DISPROVEN_REPRO = `tests/test_repro_${ids.disproven_finding_id.slice(0, 6)}.py`;
export const DISPROVEN_HEAD_PANE = [
  `$ git checkout ${HEAD} && pytest -q ${DISPROVEN_REPRO}`,
  progress("."),
  "1 passed in 0.61s",
].join("\n");

/** A deliberately long line: the sandbox invocation, well past 80 columns. */
export const LONG_PANE = [
  `$ docker run --rm --network=none --read-only --tmpfs /tmp:rw,size=64m --memory=512m --cpus=1 --pids-limit=128 -v "$PWD:/work:ro" -w /work python:3.12-slim python -m pytest -q -p no:cacheprovider ${REPRO}::${TEST}`,
  progress("F"),
  `FAILED ${REPRO}::${TEST} - AttributeError: 'NoneType' object has no attribute 'currency'`,
  "1 failed in 0.39s",
].join("\n");

const ESC = "\x1b[";
const sgr = (code: string, text: string) => `${ESC}${code}m${text}${ESC}0m`;
const FAMILIES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

/** Raw SGR sequences, exactly as a capture would carry them. */
export const ANSI_PANE = [
  `30-37   ${FAMILIES.map((f, i) => sgr(String(30 + i), f)).join(" ")}`,
  `90-97   ${FAMILIES.map((f, i) => sgr(String(90 + i), f)).join(" ")}`,
  `1 2 3   ${sgr("1", "bold")} ${sgr("2", "dim")} ${sgr("3", "italic")}`,
  `4 9 8   ${sgr("4", "underline")} ${sgr("9", "strike")} [${sgr("8", "hidden")}]`,
  `7       ${sgr("7", " reverse ")} ${sgr("41", " bg red ")} ${sgr("42", " bg green ")} ${sgr("43", " bg yellow ")} ${sgr("46", " bg cyan ")}`,
  `38;5;n  ${sgr("38;5;196", "196")} ${sgr("38;5;214", "214")} ${sgr("38;5;46", "46")} ${sgr("38;5;51", "51")} ${sgr("38;5;21", "21")} ${sgr("38;5;201", "201")} ${sgr("38;5;244", "244")} ${sgr("38;5;253", "253")}`,
  `38;2    ${sgr("38;2;255;85;85", "255,85,85")} ${sgr("38;2;80;200;255", "80,200,255")} ${sgr("38;2;128;128;128", "128,128,128")}`,
  `progress 12%\rprogress 57%\rprogress 100%`,
  `${sgr("32", "1 passed")} in 0.42s`,
  `${sgr("31;1", "E       AttributeError")}${sgr("31", ": 'NoneType' object has no attribute 'currency'")}`,
  `${sgr("31", "1 failed")} in 0.39s`,
].join("\n");

/** tests/test_repro_7e3f1a.py, lines 26–41: the failing assertion is line 41. */
export const REPRO_START = 26;
export const REPRO_SOURCE = [
  "import pytest",
  "",
  "from checkout.accounts import resolve_account",
  "from checkout.charge import charge",
  "",
  `# Generated for finding ${FINDING}. Passes at ${BASE}, fails at ${HEAD}.`,
  "",
  "",
  "@pytest.fixture(autouse=True)",
  "def _ledger(monkeypatch):",
  '    monkeypatch.setenv("LEDGER_URL", "memory://")',
  "",
  "",
  `def ${TEST}():`,
  '    acct = resolve_account("acct_7f31")',
  '    assert charge(acct, 1200).currency == "usd"',
].join("\n");

/** checkout/charge.py at head, lines 30–48. */
export const CHARGE_START = 30;
export const CHARGE_HEAD = [
  "from checkout import audit, ledger",
  "from checkout.sessions import create_session, open_session",
  "",
  "",
  "def charge(account, amount_cents):",
  '    """Charge amount_cents in the account\'s own currency."""',
  "    session = open_session(account, reuse=True)",
  "    if session.pending:",
  "        session.flush()",
  "    receipt = session.capture(amount_cents, currency=session.currency)",
  '    audit.log("charge", receipt.id)',
  "    ledger.record(receipt)",
  "",
  "",
  "def refund(receipt, amount_cents=None):",
  "    session = open_session(receipt.account)",
  "    if amount_cents is None:",
  "        amount_cents = receipt.amount_cents",
  "    return session.refund(receipt.id, amount_cents, currency=session.currency)",
].join("\n");

/** checkout/charge.py, base → head. `return receipt` became `ledger.record(receipt)`: head line 41. */
export const CHARGE_DIFF = [
  "diff --git a/checkout/charge.py b/checkout/charge.py",
  "index 3b1f0c2..8e4d9a7 100644",
  "--- a/checkout/charge.py",
  "+++ b/checkout/charge.py",
  "@@ -32,11 +32,13 @@ from checkout.sessions import create_session, open_session",
  " ",
  " ",
  " def charge(account, amount_cents):",
  '     """Charge amount_cents in the account\'s own currency."""',
  "-    session = create_session(account)",
  "-    receipt = session.capture(amount_cents, currency=account.currency)",
  "+    session = open_session(account, reuse=True)",
  "+    if session.pending:",
  "+        session.flush()",
  "+    receipt = session.capture(amount_cents, currency=session.currency)",
  '     audit.log("charge", receipt.id)',
  "-    return receipt",
  "+    ledger.record(receipt)",
  " ",
  " ",
  " def refund(receipt, amount_cents=None):",
  "@@ -43,4 +45,4 @@ def refund(receipt, amount_cents=None):",
  "-    session = create_session(receipt.account)",
  "+    session = open_session(receipt.account)",
  "     if amount_cents is None:",
  "         amount_cents = receipt.amount_cents",
  "-    return session.refund(receipt.id, amount_cents, currency=receipt.currency)",
  "\\ No newline at end of file",
  "+    return session.refund(receipt.id, amount_cents, currency=session.currency)",
  "\\ No newline at end of file",
].join("\n");

/** Accused rows over added, context and removed lines: each comment names the highlight the
 *  row carries. New side 10–15, old side 10–12. */
export const BAND_DIFF = [
  "@@ -10,3 +10,6 @@ def specimen():",
  "+    added()      # no highlight: the diff tint",
  "+    added()      # fill critical, rail alarm: a blocking finding",
  "+    added()      # fill high, rail alarm: a blocking finding in the high band",
  "+    added()      # fill high, rail high",
  "     context()    # fill medium, rail medium",
  "-    removed()    # fill low, rail low",
  "+    added()      # fill info, rail info",
  "-    removed()    # no highlight: the diff tint",
].join("\n");

export const BAND_HIGHLIGHTS: DiffHighlight[] = [
  { side: "new", start: 11, tone: "alarm", fill: "critical" },
  { side: "new", start: 12, tone: "alarm", fill: "high" },
  { side: "new", start: 13, tone: "high" },
  { side: "new", start: 14, tone: "medium" },
  { side: "old", start: 11, tone: "low" },
  { side: "new", start: 15, tone: "info" },
];

/** A client-highlighted block: an audit document keyed by the manifest ids. */
export const AUDIT_JSON = JSON.stringify(
  {
    seq: ids.tamper_demo_seq,
    event_type: "gate.blocked",
    tenant_id: ids.tenant_id,
    payload: { review_id: ids.demo_review_id, finding_id: ids.proven_finding_id, base_sha: ids.base_sha, head_sha: ids.head_sha },
  },
  null,
  2,
);

/** One snippet per bundled grammar, plus one the bundle does not carry. */
export const LANGUAGE_SPECIMENS: { lang?: string; filePath: string; code: string }[] = [
  {
    filePath: "web/src/lib/contribution.ts",
    code: [
      "export function contribution(value: number, weight: number): number {",
      "  // raw × weight, printed to 3 decimals",
      "  return Math.round(value * weight * 1000) / 1000;",
      "}",
    ].join("\n"),
  },
  {
    filePath: "web/src/components/verdict.tsx",
    code: [
      "export function Verdict({ proven }: { proven: boolean }) {",
      '  return <span data-state={proven ? "proven" : "disproven"}>{proven ? "PROVEN" : "DISPROVEN"}</span>;',
      "}",
    ].join("\n"),
  },
  {
    filePath: "scripts/count.mjs",
    code: ['const passed = results.filter((r) => r.outcome === "passed").length;', "console.log(`${passed} passed`);"].join("\n"),
  },
  {
    filePath: "fixtures/ids.json",
    code: JSON.stringify({ review_id: ids.demo_review_id, base_sha: ids.base_sha, head_sha: ids.head_sha, pr_number: ids.pr_number }, null, 2),
  },
  {
    filePath: "sandbox/run.sh",
    code: [`#!/usr/bin/env bash`, `set -euo pipefail`, `git checkout "${BASE}" && pytest -q "${REPRO}"  # expect exit 0`, `echo "exit $?"`].join("\n"),
  },
  {
    filePath: ".prguard.yml",
    code: ["gate:", "  block_on: proven   # a finding blocks only with proof_status: proven", "  min_severity: high", "sandbox:", "  image: python:3.12-slim", "  timeout_s: 120"].join("\n"),
  },
  {
    filePath: "pyproject.toml",
    code: ["[tool.pytest.ini_options]", 'addopts = "-q -p no:cacheprovider"', 'testpaths = ["tests"]', "xfail_strict = true"].join("\n"),
  },
  {
    filePath: "comment.md",
    code: [`### proof_status: proven`, "", `The repro test passed at \`${BASE}\` and failed at \`${HEAD}\`.`, "", `- repro: [${REPRO}](#)`].join("\n"),
  },
  {
    filePath: "checkout/charge.patch",
    code: ["@@ -39,1 +41,1 @@", "-    return receipt", "+    ledger.record(receipt)"].join("\n"),
  },
  {
    filePath: "lib/checkout/charge.ex",
    code: ["defmodule Checkout.Charge do", "  def charge(account, amount), do: Session.capture(account, amount)", "end"].join("\n"),
  },
];
