// OWNER: t1d. Unified diff parsing and split-view pairing.
import { describe, expect, it } from "vitest";
import { pairRows, parseUnifiedDiff } from "@/components/code/diff/parse";

const DIFF = [
  "diff --git a/checkout/charge.py b/checkout/charge.py",
  "index 3b1f0c2..8e4d9a7 100644",
  "--- a/checkout/charge.py",
  "+++ b/checkout/charge.py",
  "@@ -32,5 +32,6 @@ from checkout.sessions import open_session",
  " ",
  " def charge(account, amount_cents):",
  "-    session = create_session(account)",
  "+    session = open_session(account, reuse=True)",
  "+    if session.pending:",
  "     audit.log(\"charge\", receipt.id)",
  "-    return receipt",
  "+    ledger.record(receipt)",
  "@@ -60,2 +61,2 @@ def refund(receipt):",
  "--- a line whose text starts with two dashes",
  "+++ and one whose text starts with two pluses",
  " tail",
  "\\ No newline at end of file",
].join("\n");

describe("parseUnifiedDiff", () => {
  const parsed = parseUnifiedDiff(DIFF);

  it("reads the paths from the git headers", () => {
    expect(parsed.oldPath).toBe("checkout/charge.py");
    expect(parsed.newPath).toBe("checkout/charge.py");
  });

  it("numbers both sides from the hunk headers", () => {
    const rows = parsed.rows.map((r) => [r.kind, r.oldLine ?? null, r.newLine ?? null, r.text]);
    expect(rows.slice(0, 9)).toEqual([
      ["hunk", null, null, "@@ -32,5 +32,6 @@ from checkout.sessions import open_session"],
      ["context", 32, 32, ""],
      ["context", 33, 33, "def charge(account, amount_cents):"],
      ["del", 34, null, "    session = create_session(account)"],
      ["add", null, 34, "    session = open_session(account, reuse=True)"],
      ["add", null, 35, "    if session.pending:"],
      ["context", 35, 36, '    audit.log("charge", receipt.id)'],
      ["del", 36, null, "    return receipt"],
      ["add", null, 37, "    ledger.record(receipt)"],
    ]);
    expect(parsed.rows[0].hunk).toEqual({ oldStart: 32, oldLines: 5, newStart: 32, newLines: 6, section: "from checkout.sessions import open_session" });
  });

  it("consumes hunk bodies by count, so '--- ' and '+++ ' text inside a hunk stays a line", () => {
    const second = parsed.rows.slice(9).map((r) => [r.kind, r.oldLine ?? null, r.newLine ?? null, r.text]);
    expect(second).toEqual([
      ["hunk", null, null, "@@ -60,2 +61,2 @@ def refund(receipt):"],
      ["del", 60, null, "-- a line whose text starts with two dashes"],
      ["add", null, 61, "++ and one whose text starts with two pluses"],
      ["context", 61, 62, "tail"],
      ["meta", null, null, "\\ No newline at end of file"],
    ]);
  });

  it("counts additions and deletions", () => {
    expect(parsed.additions).toBe(4);
    expect(parsed.deletions).toBe(3);
  });

  it("accepts GitHub's patch field (hunks only), CRLF, and an empty context line without its space", () => {
    const patch = "@@ -7,2 +7,3 @@\r\n context\r\n\r\n+added\r\n";
    const p = parseUnifiedDiff(patch);
    expect(p.oldPath).toBeNull();
    expect(p.rows[0].hunk).toMatchObject({ oldStart: 7, oldLines: 2, newStart: 7, newLines: 3 });
    expect(p.rows.map((r) => [r.kind, r.oldLine ?? null, r.newLine ?? null, r.text])).toEqual([
      ["hunk", null, null, "@@ -7,2 +7,3 @@"],
      ["context", 7, 7, "context"],
      ["context", 8, 8, ""],
      ["add", null, 9, "added"],
    ]);
  });

  it("reads an omitted hunk count as one line", () => {
    const p = parseUnifiedDiff("@@ -7 +7 @@\n-x\n+y");
    expect(p.rows[0].hunk).toMatchObject({ oldStart: 7, oldLines: 1, newStart: 7, newLines: 1 });
    expect(p.rows.map((r) => r.kind)).toEqual(["hunk", "del", "add"]);
  });

  it("stops at a second file, and survives a hunk that promised more lines than it has", () => {
    const two = `${DIFF}\ndiff --git a/other.py b/other.py\n--- a/other.py\n+++ b/other.py\n@@ -1 +1 @@\n-x\n+y`;
    expect(parseUnifiedDiff(two).rows).toHaveLength(parsed.rows.length);
    const short = parseUnifiedDiff("@@ -1,5 +1,5 @@\n a\n-b\n+c");
    expect(short.rows.map((r) => r.kind)).toEqual(["hunk", "context", "del", "add"]);
  });

  it("reads /dev/null as a missing side", () => {
    const created = parseUnifiedDiff("--- /dev/null\n+++ b/new.py\n@@ -0,0 +1,1 @@\n+x");
    expect(created.oldPath).toBeNull();
    expect(created.newPath).toBe("new.py");
  });
});

describe("pairRows (split view)", () => {
  it("puts context on both sides and pads the shorter side of a change block", () => {
    const pairs = pairRows(parseUnifiedDiff(DIFF).rows);
    const view = pairs.slice(0, 8).map((p) => [
      p.left.kind === "empty" ? "·" : `${p.left.kind}${"oldLine" in p.left ? (p.left.oldLine ?? "") : ""}`,
      p.right.kind === "empty" ? "·" : `${p.right.kind}${"newLine" in p.right ? (p.right.newLine ?? "") : ""}`,
    ]);
    expect(view).toEqual([
      ["hunk", "hunk"],
      ["context32", "context32"],
      ["context33", "context33"],
      ["del34", "add34"],
      ["·", "add35"],
      ["context35", "context36"],
      ["del36", "add37"],
      ["hunk", "hunk"],
    ]);
  });

  it("keeps a '\\ No newline' row on the side of the line it annotates", () => {
    const pairs = pairRows(parseUnifiedDiff("@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file").rows);
    expect(pairs.map((p) => [p.left.kind, p.right.kind])).toEqual([
      ["hunk", "hunk"],
      ["del", "add"],
      ["meta", "meta"],
    ]);
  });
});
