"""The GitHub review a run posts — brand-gaps §E, rendered from the run's own values.

§E is the design of the one surface most users ever see, and it is also the S8 spec. Every
number in it here is read off the run: the counts from the findings rows, the severity
breakdown from ``weight × input`` under the weights in force, the fingerprint from
``fingerprint.compute``, the terminal tail from the head run's captured output. Nothing is
typed into the template except its sentence frames.

Rules §E sets, and where they are kept:

* ``event: COMMENT``, never an approval — the payload's ``event`` and the summary's last line.
* No emoji, no nitpick section, markdown only (``<details>``/``<summary>`` are the only HTML).
* Every inline comment carries its fingerprint; every claim links to the artifact behind it.
* "how often we're wrong ↗" on every comment whose finding has ``proof_status: proven``.
* Terminal output always inside ``<details>``.
* Numbers: scores, weights and contributions to three decimals; latency to one decimal.

Where §E's sample text disagrees with the voice rules in brand-gaps §D, §D wins without
changing §E's structure: a state is a value ("a finding with ``proof_status: proven``", never
"a proven finding"), and a threshold prints to three decimals like every other score.
"""

from __future__ import annotations

from typing import Any

from corpus.backend import BANDS, PUBLIC_BASE_URL, SETTINGS, comment_ladder
from corpus.backend import core_types

#: The dashboard origin a comment links back to (``gen_fixtures.py`` documents it).
DASHBOARD = PUBLIC_BASE_URL

#: Plan §5's canonical order — the order the contribution bar draws its six segments in.
SEVERITY_ORDER = (
    "path_sensitivity",
    "reachability",
    "blast_radius",
    "coverage_gap",
    "proof_confidence",
    "churn",
)

#: Fixed copy (brand-gaps §D) — verbatim wherever it appears.
ADVISORY = "Only proven findings can block a merge. Everything else is a comment."


def short(sha: str | None) -> str:
    return (sha or "")[:7]


def fingerprint_label(value: str | None) -> str:
    """Brand-gaps §D: hashes print as ``first-8…last-4``."""
    if not value:
        return "unfingerprinted"
    return f"{value[:8]}…{value[-4:]}"


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def span(start: int, end: int) -> str:
    return f"{start}" if end <= start else f"{start}-{end}"


def contributions(severity: core_types.SeverityResult) -> list[tuple[str, float]]:
    measured = severity.inputs.as_mapping()
    return [(name, severity.weights[name] * measured[name]) for name in SEVERITY_ORDER]


def threshold_clause(severity: core_types.SeverityResult) -> str:
    band = severity.band
    if band == "info":
        return f"below the `{BANDS['low']:.3f}` low threshold"
    return f"crossing the `{BANDS[band]:.3f}` {band} threshold"


def severity_paragraph(item: Any) -> str:
    severity = item.canon.severity
    parts = " + ".join(f"{name} `{value:.3f}`" for name, value in contributions(severity))
    link = f"{DASHBOARD}/findings/{item.row.id}#severity"
    return (
        f"**Severity `{severity.score:.3f}`** — {parts}, {threshold_clause(severity)}.\n"
        f"[inputs and weights ↗]({link})"
    )


def result_cell(result: core_types.RunResult | None) -> str:
    """The run's own summary line: ``1 passed in 0.42s``, or what stopped it."""
    if result is None:
        return "not run"
    if result.timed_out:
        return f"killed after {SETTINGS.PROOF_TIMEOUT}s"
    for line in reversed(result.stdout.splitlines()):
        text = line.strip().strip("=").strip()
        if text and " in " in text and text.endswith("s") and text[0].isdigit():
            return text
    return f"exit {result.exit_code}"


def terminal_tail(result: core_types.RunResult) -> list[str]:
    """From the first ``E`` line to the end, blank lines out — §E's three-line receipt."""
    lines = result.stdout.splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith("E ")), None)
    if start is None:
        return [line for line in lines[-3:] if line.strip()]
    tail = [line for line in lines[start:] if line.strip()]
    # The short test summary repeats the E line; §E's receipt stops at the location + count.
    return [line for line in tail if not line.startswith(("=", "FAILED ", "ERROR "))]


def proof_table(record: Any, outcome: core_types.ProofOutcome) -> str:
    row = record.row
    return "\n".join(
        [
            "| | SHA | result |",
            "|---|---|---|",
            f"| base | `{short(row.base_sha)}` | `{result_cell(outcome.base)}` |",
            f"| head | `{short(row.head_sha)}` | `{result_cell(outcome.head)}` |",
        ]
    )


def proof_section(record: Any, item: Any) -> str:
    canon = item.canon
    status = canon.proof_status
    outcome = item.outcome
    if status == "proven":
        where = (
            "executed in a sandbox at both SHAs"
            if outcome.isolation == "isolated"
            else "executed at both SHAs by the local runner (`isolation: degraded`)"
        )
        tail = "\n".join(f"    {line}" for line in terminal_tail(outcome.head))
        return (
            f"**Proof** — a repro test was generated and {where}:\n\n"
            f"{proof_table(record, outcome)}\n\n"
            f"<details><summary>terminal output at head <code>{short(record.row.head_sha)}</code>"
            f"</summary>\n\n{tail}\n\n</details>"
        )
    if status == "inconclusive":
        kind = item.proof.kind if item.proof is not None else ""
        if kind == "fails_both":
            lead = "a repro test was executed at both SHAs and failed at both, so the failure predates this pull request"
        elif kind == "head_timeout":
            lead = (
                f"the repro test passed at base and was stopped at head after the "
                f"`{SETTINGS.PROOF_TIMEOUT}s` limit, so nothing is claimed"
            )
        elif kind == "wrong_signal":
            lead = (
                f"the repro test failed at head, but without the predicted `{item.proof.signal}`, "
                "so nothing is claimed"
            )
        elif kind == "deps_failed":
            lead = "a dependency the repro test needed did not install, so nothing is claimed"
        elif kind == "collection_error":
            lead = (
                f"the repro test could not be imported at either SHA (`No module named "
                f"'{item.proof.missing_module}'`), so nothing is claimed"
            )
        elif kind == "nothing_collected":
            lead = "the repro test skipped itself at both SHAs, so no test executed and nothing is claimed"
        else:
            lead = "the repro test ran without a passing-to-failing result, so nothing is claimed"
        return f"**Proof** — {lead}:\n\n{proof_table(record, outcome)}"
    if status == "not_applicable":
        return (
            "**Proof** — not applicable: the sandbox executes Python repro tests, and "
            f"`{canon.file_path}` is not Python."
        )
    if status == "skipped_no_env":
        return "**Proof** — skipped: no sandbox was available for this run, so nothing was executed."
    # not_attempted
    reason = item.selection
    if item.proof is not None and item.proof.kind == "gen_fail":
        return "**Proof** — not attempted: the repro generator did not return a runnable test for this finding."
    if reason == "category_not_provable":
        return f"**Proof** — not attempted: a `{canon.category}` finding is not one a test can settle."
    if reason == "below_min_score":
        return (
            f"**Proof** — not attempted: severity `{canon.severity.score:.3f}` is below the "
            f"`{SETTINGS.PROOF_MIN_SCORE:.3f}` proof threshold."
        )
    if reason == "budget_exhausted":
        return (
            f"**Proof** — not attempted: {SETTINGS.PROOF_MAX_PER_RUN} higher-scoring findings used "
            "this run's proof budget."
        )
    return "**Proof** — not attempted."


def location_prefix(assignment: Any) -> str | None:
    if assignment.mode == "inline_nearest":
        return comment_ladder.nearest_line_note(assignment.file_path, assignment.line)
    if assignment.mode == "file_level":
        return (
            f"> File-level comment. The issue is at "
            f"`{assignment.file_path}:{span(assignment.line, assignment.end_line)}`."
        )
    return None


def gate_sentence(record: Any, item: Any) -> str:
    canon = item.canon
    if canon.proof_status != "proven":
        return ADVISORY
    context = SETTINGS.GATE_CONTEXT_NAME
    if item.row.blocking:
        others = [
            other for other in record.published if other is not item and not other.row.blocking
        ]
        sentence = f"This finding has `proof_status: proven`, so the `{context}` check is failing."
        if others:
            verb = "is" if len(others) == 1 else "are"
            count = _count_word(len(others)).capitalize()
            noun = "finding" if len(others) == 1 else "findings"
            sentence += f" {count} other {noun} in this review {verb} advisory and do not block."
        return sentence
    return (
        f"This finding has `proof_status: proven` and scores `{canon.severity.score:.3f}` "
        f"{canon.severity.band}, below `{SETTINGS.BLOCK_MIN_SEVERITY}`, the lowest band that "
        "blocks, so it is advisory."
    )


def _count_word(count: int) -> str:
    words = ("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")
    return words[count] if count < len(words) else str(count)


def inline_body(record: Any, item: Any) -> str:
    canon = item.canon
    severity = canon.severity
    parts: list[str] = []
    prefix = location_prefix(item.assignment)
    if prefix:
        parts.append(prefix)
    parts.append(
        f"**`proof_status: {canon.proof_status}`** · severity **`{severity.score:.3f}`** "
        f"{severity.band}"
    )
    parts.append(canon.body_markdown)
    parts.append(proof_section(record, item))
    parts.append(severity_paragraph(item))
    parts.append(gate_sentence(record, item))
    links = [
        f"`fingerprint {fingerprint_label(canon.fingerprint)}`",
        f"[dismiss with a reason ↗]({DASHBOARD}/findings/{item.row.id}#suppress)",
    ]
    if canon.proof_status == "proven":
        links.append(f"[how often we're wrong ↗]({DASHBOARD}/accuracy)")
    parts.append(" · ".join(links))
    return "\n\n".join(parts)


def comment_payload(record: Any, item: Any) -> dict[str, Any]:
    """``ReviewComment.as_payload`` field order: path, body, line/side, start_*, subject_type."""
    assignment = item.assignment
    payload: dict[str, Any] = {"path": assignment.file_path, "body": inline_body(record, item)}
    if assignment.anchor_line is not None:
        payload["line"] = assignment.anchor_line
        payload["side"] = assignment.side
    if assignment.anchor_start_line is not None:
        payload["start_line"] = assignment.anchor_start_line
        payload["start_side"] = assignment.side
    if assignment.mode == "file_level":
        payload["subject_type"] = comment_ladder.FILE_SUBJECT_TYPE
    return payload


def tally(record: Any) -> dict[str, int]:
    findings = record.findings
    canonical = record.canonical
    return {
        "raised": len(findings),
        "dropped": sum(1 for f in findings if f.canon is None and f.drop_reason != "duplicate"),
        "deduplicated": sum(1 for f in findings if f.canon is None and f.drop_reason == "duplicate"),
        "suppressed": sum(1 for f in canonical if f.canon.status == "suppressed"),
        "proven": sum(1 for f in canonical if f.canon.proof_status == "proven"),
        "disproven": sum(1 for f in canonical if f.canon.status == "disproven"),
        "advisory": sum(
            1
            for f in canonical
            if f.canon.status == "published" and f.canon.proof_status != "proven"
        ),
    }


def gate_line(record: Any) -> str:
    decision = record.gate
    proven = [f for f in record.canonical if f.canon.proof_status == "proven"]
    if decision.conclusion == "failure":
        count = len(decision.blocking_finding_ids)
        noun = "finding" if count == 1 else "findings"
        return f"**Gate: failing** — {count} {noun} with `proof_status: proven`."
    if decision.conclusion == "neutral":
        if record.all_proofs_skipped_for_env:
            return (
                "**Gate: neutral** — no sandbox was available to run a repro test, so nothing "
                "could be proven and no merge verdict is claimed."
            )
        return (
            "**Gate: neutral** — the run degraded before every check completed, so no merge "
            "verdict is claimed."
        )
    if proven:
        noun = "finding has" if len(proven) == 1 else "findings have"
        return (
            f"**Gate: passing** — {len(proven)} {noun} `proof_status: proven`, scored below "
            f"`{SETTINGS.BLOCK_MIN_SEVERITY}`, the lowest band that blocks."
        )
    return "**Gate: passing** — no finding carries a repro test that passes at base and fails at head."


def delivered_line(record: Any) -> str:
    breakdown = record.delivery.breakdown
    parts = []
    if breakdown.inline_exact:
        parts.append(f"{breakdown.inline_exact} inline at the exact line")
    if breakdown.inline_nearest:
        parts.append(f"{breakdown.inline_nearest} at the nearest line in a diff hunk")
    if breakdown.file_level:
        parts.append(f"{breakdown.file_level} at file level")
    if breakdown.summary_only:
        parts.append(f"{breakdown.summary_only} in the table below")
    if not parts:
        return "Delivered: nothing to deliver, no finding was published. **0 silently dropped.**"
    if len(parts) > 1:
        listed = ", ".join(parts[:-1]) + ", " + parts[-1]
    else:
        listed = parts[0]
    return f"Delivered: {listed}. **0 silently dropped.**"


def summary_table(record: Any) -> str:
    rows = [
        item
        for item in record.published
        if item.assignment is not None and item.assignment.mode == "summary_only"
    ]
    if not rows:
        return ""
    lines = [
        "**Findings not attachable to the diff**",
        "",
        "| finding | where | severity | proof_status |",
        "|---|---|---|---|",
    ]
    for item in rows:
        canon = item.canon
        title = " ".join(canon.title.split()).replace("|", r"\|")
        where = f"`{canon.file_path}:{span(canon.start_line, canon.end_line)}`"
        score = f"`{canon.severity.score:.3f}` {canon.severity.band}"
        lines.append(f"| {title} | {where} | {score} | `{canon.proof_status}` |")
    return "\n".join(lines)


def summary_body(record: Any) -> str:
    row = record.row
    seconds = (row.finished_at - row.started_at).total_seconds()
    header = (
        f"**PRGuard** reviewed `#{record.spec.pr}` in {seconds:.1f}s · "
        f"[full run ↗]({DASHBOARD}/runs/{row.id})"
    )
    counts = tally(record)
    parts = [header]
    if counts["raised"] == 0:
        parts.append(
            f"**Gate: passing** — {_count_word(len(record.specialists)).capitalize()} specialists "
            f"reviewed {plural(record.selection.files_reviewed, 'file')} and raised nothing, "
            "so nothing blocks."
        )
    else:
        parts.append(gate_line(record))
        parts.append(
            "\n".join(
                [
                    "| | |",
                    "|---|---|",
                    f"| raised | {counts['raised']} |",
                    f"| dropped at the coordinator | {counts['dropped']} |",
                    f"| deduplicated | {counts['deduplicated']} |",
                    f"| suppressed by an existing rule | {counts['suppressed']} |",
                    f"| **proven** | **{counts['proven']}** |",
                    f"| disproven — refuted by execution | {counts['disproven']} |",
                    f"| inconclusive / not attempted | {counts['advisory']} |",
                ]
            )
        )
        parts.append(delivered_line(record))
        table = summary_table(record)
        if table:
            parts.append(table)
    parts.append("`event: COMMENT` — PRGuard does not approve pull requests.")
    return "\n\n".join(parts)


def render(record: Any) -> dict[str, Any]:
    """``ReviewPayload.as_payload``: event, body, commit_id, comments — as sent (or as it would
    have been sent, for a delivery GitHub refused)."""
    comments = [
        comment_payload(record, item)
        for item in record.published
        if item.assignment.mode != "summary_only" and not getattr(item, "reused", False)
    ]
    return {
        "event": "COMMENT",
        "body": summary_body(record),
        "commit_id": record.row.head_sha,
        "comments": comments,
    }
