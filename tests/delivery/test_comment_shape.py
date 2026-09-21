"""What a published comment actually says — spec §4.7, §4.4, §4.6, §6.12.

Every other delivery test asks whether a finding reached GitHub. This one asks whether the thing
that reached GitHub is worth reading, because the two are not the same question and only the
first one was ever pinned. A prompt edit, a refactor of the metadata row, or a well-meaning
tidy-up of `_comment_body` can flatten the comment back to a bold title and a paragraph while
every conservation, governance and 422 test stays green.

The shape under test, in order:

1. the proof lead, when and only when the finding was **proven**, above everything else;
2. the imperative title, alone on its line — never welded to a proof claim;
3. one metadata row: category, severity band, the measured §4.4 inputs the band came from, and
   the proof state;
4. the body, then the fix, then the failing run, then where the issue is.

Degradation is pinned as hard as the happy path: a finding with no `remediation`, no severity and
no proof outcome must produce today's comment minus those parts, never an exception and never an
empty section heading.
"""

from __future__ import annotations

from prguard.core import severity as severity_module
from prguard.core.delivery.comment_ladder import assign_rungs
from prguard.core.delivery.review_poster import (
    PROOF_OUTPUT_MAX_LINES,
    PROVEN_LEAD,
    SUMMARY_SECTION_HEADING,
    build_review_payload,
)
from prguard.core.types import (
    CanonicalFinding,
    LineMap,
    ProofOutcome,
    ProofStatus,
    RunResult,
    SeverityResult,
)
from tests.delivery.conftest import make_finding

ORDERS = "app/orders.py"

#: The lines the diff touched in `app/orders.py`. Line 6 — the `def` — is untouched context, so
#: this is also the corpus for "anchor inside the span, not on the signature".
ORDERS_TOUCHED = frozenset({9, 10, 11, 12})

IMPERATIVE_TITLE = "Preserve the no-promotion contract."

REMEDIATION = (
    "Restore the `if rate is None: return price` early return, or normalise both callers to a "
    "numeric rate and update their contracts and tests."
)

FAILING_OUTPUT = (
    "tests/test_prguard_repro.py::test_apply_discount_none_rate FAILED\n"
    ">       assert apply_discount(100, None) == 100\n"
    "E       TypeError: unsupported operand type(s) for -: 'int' and 'NoneType'\n"
    "=========================== 1 failed in 0.04s ==========================="
)


def scored(
    *,
    public_entrypoint: bool = True,
    internal_callers: int = 3,
    path_sensitivity: float = 1.0,
    symbol_is_tested: bool = False,
    file_is_tested: bool = False,
    commits_last_90d: int | None = 6,
    proof_status: ProofStatus = "proven",
) -> SeverityResult:
    """A real §4.4 score. Never hand-written: the row must describe the number we shipped."""
    derived = severity_module.derive_inputs(
        public_entrypoint=public_entrypoint,
        internal_callers=internal_callers,
        path_sensitivity=path_sensitivity,
        symbol_is_tested=symbol_is_tested,
        file_is_tested=file_is_tested,
        commits_last_90d=commits_last_90d,
        proof_status=proof_status,
    )
    return severity_module.compute(derived.inputs, proof_status=proof_status)


def finding(**overrides: object) -> CanonicalFinding:
    defaults: dict[str, object] = {
        "id": "f-orders",
        "title": IMPERATIVE_TITLE,
        "body_markdown": "Lines 6-15 pass `None` when a line has no `discount_rate`.",
        "remediation": REMEDIATION,
        "file_path": ORDERS,
        "start_line": 6,
        "end_line": 15,
        "symbol_path": f"{ORDERS}::apply_discount",
        "proof_status": "proven",
        "severity": scored(),
    }
    defaults.update(overrides)
    return make_finding(**defaults)


def proven_outcome(output: str = FAILING_OUTPUT) -> ProofOutcome:
    return ProofOutcome(
        status="proven",
        outcome="failing_as_expected",
        runner="subprocess",
        isolation="degraded",
        baseline_mode="compared",
        base=RunResult(exit_code=0),
        head=RunResult(exit_code=1, stdout=output),
    )


def comment_for(
    published: CanonicalFinding,
    *,
    outcome: ProofOutcome | None = None,
    line_map: LineMap | None = None,
    secrets: tuple[str, ...] = (),
) -> str:
    """The body of the one comment the payload carries for ``published``."""
    maps = {ORDERS: line_map or LineMap(ORDERS, commentable_lines=ORDERS_TOUCHED)}
    payload = build_review_payload(
        findings=[published],
        assignments=assign_rungs([published], maps),
        files_reviewed=3,
        proof_outcomes={published.id: outcome} if outcome is not None else {},
        secrets=secrets,
    )
    assert len(payload.comments) == 1, "this helper is about the comment, not the ladder"
    return payload.comments[0].body


def body_for(*findings: CanonicalFinding) -> str:
    maps = {ORDERS: LineMap(ORDERS, commentable_lines=ORDERS_TOUCHED)}
    return build_review_payload(
        findings=list(findings),
        assignments=assign_rungs(list(findings), maps),
        files_reviewed=3,
    ).body


def blocks(text: str) -> list[str]:
    """The comment split into the paragraphs a reader sees, in order."""
    return [block for block in text.split("\n\n") if block.strip()]


# ---------------------------------------------------------------------------
# The order of the comment — the part a refactor silently rearranges
# ---------------------------------------------------------------------------


def test_a_proven_comment_leads_with_the_proof() -> None:
    """The one claim nothing else on the market makes, and it used to be the last thing said."""
    parts = blocks(comment_for(finding(), outcome=proven_outcome()))

    assert parts[0] == PROVEN_LEAD
    assert parts[1] == f"**{IMPERATIVE_TITLE}**"


def test_the_comment_reads_in_the_documented_order() -> None:
    parts = blocks(comment_for(finding(), outcome=proven_outcome()))
    positions = {
        "proof lead": parts.index(PROVEN_LEAD),
        "title": next(i for i, p in enumerate(parts) if p.startswith(f"**{IMPERATIVE_TITLE}")),
        "metadata": next(i for i, p in enumerate(parts) if p.startswith("`correctness`")),
        "body": next(i for i, p in enumerate(parts) if "discount_rate" in p),
        "fix": next(i for i, p in enumerate(parts) if p.startswith("**Fix:**")),
        "output": next(i for i, p in enumerate(parts) if p.startswith("<details>")),
        "location": next(i for i, p in enumerate(parts) if p.startswith("_Issue at")),
    }

    assert list(positions) == sorted(positions, key=lambda name: positions[name])


def test_the_title_stands_alone_and_is_not_welded_to_a_claim() -> None:
    """It read `**<title>** — advisory.`, which turned every instruction into a caveat."""
    parts = blocks(comment_for(finding(proof_status="not_attempted"), outcome=None))

    assert f"**{IMPERATIVE_TITLE}**" in parts
    assert not any(part.startswith(f"**{IMPERATIVE_TITLE}** —") for part in parts)


# ---------------------------------------------------------------------------
# The metadata row — §4.4's number, and what it was computed from
# ---------------------------------------------------------------------------


def test_the_metadata_row_names_the_category_band_and_measured_inputs() -> None:
    """Our severity is a weighted sum of measured inputs; a badge alone throws that away."""
    published = finding()
    row = next(part for part in blocks(comment_for(published)) if part.startswith("`correctness`"))

    assert published.severity is not None
    assert f"severity **{published.severity.band}**" in row
    assert "computed from:" in row
    assert "reachable from a public entrypoint" in row
    assert "untested" in row


def test_the_row_counts_callers_and_commits_rather_than_printing_a_ratio() -> None:
    """`blast radius 0.30` is a number for us; `3 callers` is a fact the author can check."""
    published = finding(
        severity=scored(
            public_entrypoint=False,
            internal_callers=3,
            path_sensitivity=0.0,
            symbol_is_tested=True,
            file_is_tested=True,
            commits_last_90d=10,
            proof_status="not_attempted",
        ),
        proof_status="not_attempted",
    )

    row = next(part for part in blocks(comment_for(published)) if part.startswith("`correctness`"))

    assert "3 callers" in row
    assert "10 commits in 90 days" in row
    assert "0.3" not in row and "0.5" not in row


def test_the_row_reports_the_band_it_was_given_and_never_recomputes_it() -> None:
    """Presentation may not touch severity; a separate track owns why the inputs are what
    they are, and this row's only job is to report the number it was handed."""
    low = finding(
        severity=scored(
            public_entrypoint=False,
            internal_callers=0,
            path_sensitivity=0.0,
            symbol_is_tested=True,
            file_is_tested=True,
            commits_last_90d=0,
            proof_status="not_attempted",
        ),
        proof_status="not_attempted",
    )

    assert low.severity is not None
    assert "severity **info**" in comment_for(low)
    assert low.severity.band == "info", "the finding's own score, untouched by rendering"


def test_an_unscored_finding_says_so_instead_of_inventing_a_band() -> None:
    row = next(
        part
        for part in blocks(comment_for(finding(severity=None, proof_status="not_attempted")))
        if part.startswith("`correctness`")
    )

    assert "severity **unscored**" in row
    assert "computed from:" not in row


# ---------------------------------------------------------------------------
# Proof status, stated rather than apologised for
# ---------------------------------------------------------------------------


def test_the_failing_run_ships_with_the_finding_that_it_proved() -> None:
    comment = comment_for(finding(), outcome=proven_outcome())

    assert "<details><summary>" in comment
    assert "TypeError: unsupported operand type(s)" in comment
    assert "1 failed in 0.04s" in comment


def test_a_long_run_is_quoted_by_its_tail_where_pytest_puts_the_failure() -> None:
    noisy = "\n".join(f"collected line {index}" for index in range(200)) + "\n" + FAILING_OUTPUT

    comment = comment_for(finding(), outcome=proven_outcome(noisy))

    assert "1 failed in 0.04s" in comment
    assert "collected line 0" not in comment
    quoted = comment.split("```text\n", 1)[1].split("\n```", 1)[0]
    assert len(quoted.splitlines()) <= PROOF_OUTPUT_MAX_LINES


def test_a_proven_finding_with_no_recorded_run_still_leads_with_the_proof() -> None:
    """A dry run has the verdict and not the artifact; the claim is still the true one."""
    comment = comment_for(finding(), outcome=None)

    assert comment.startswith(PROVEN_LEAD)
    assert "<details>" not in comment


def test_an_unproven_finding_states_its_verdict_without_hedging() -> None:
    comment = comment_for(finding(proof_status="not_attempted", severity=None))

    assert PROVEN_LEAD not in comment
    assert "not executed, reasoned from the diff" in comment
    for apology in ("advisory", "unfortunately", "we were unable", "sorry", "just"):
        assert apology not in comment.lower()


def test_an_unproven_finding_never_quotes_a_run_that_proved_nothing() -> None:
    """Quoting the output of an inconclusive run dresses a guess up as evidence."""
    inconclusive = ProofOutcome(
        status="inconclusive",
        outcome="pre_existing_failure",
        runner="subprocess",
        isolation="degraded",
        baseline_mode="compared",
        head=RunResult(exit_code=1, stdout=FAILING_OUTPUT),
    )

    comment = comment_for(finding(proof_status="inconclusive"), outcome=inconclusive)

    assert "repro ran, inconclusive" in comment
    assert "<details>" not in comment
    assert "TypeError" not in comment


def test_a_disproven_finding_owns_the_mistake_in_its_own_row() -> None:
    comment = comment_for(finding(proof_status="disproven", severity=None))

    assert "disproven" in comment
    assert "our false positive" in comment


# ---------------------------------------------------------------------------
# The remediation — §6.12's optional field, and what its absence costs
# ---------------------------------------------------------------------------


def test_the_fix_is_on_the_comment() -> None:
    comment = comment_for(finding())

    assert f"**Fix:** {REMEDIATION}" in blocks(comment)


def test_a_finding_without_a_remediation_degrades_to_a_body_only_comment() -> None:
    """§6.12 keeps the field optional so this is a missing line, never a lost finding."""
    comment = comment_for(finding(remediation=None))

    assert "**Fix:**" not in comment
    assert f"**{IMPERATIVE_TITLE}**" in comment
    assert "discount_rate" in comment


# ---------------------------------------------------------------------------
# Where the comment lands, and what it admits about it
# ---------------------------------------------------------------------------


def test_the_comment_anchors_on_the_changed_line_and_names_the_real_span() -> None:
    """Line 6 is the `def`; the diff touched 9-12. Comment goes on 9, body says 6-15."""
    published = finding()
    payload = build_review_payload(
        findings=[published],
        assignments=assign_rungs(
            [published], {ORDERS: LineMap(ORDERS, commentable_lines=ORDERS_TOUCHED)}
        ),
        files_reviewed=3,
    )

    assert payload.comments[0].line == 9
    assert f"_Issue at `{ORDERS}:6-15`._" in payload.comments[0].body
    assert "Nearest reviewable line" not in payload.comments[0].body


def test_a_comment_covering_its_whole_span_does_not_repeat_the_location() -> None:
    published = finding(start_line=9, end_line=12)

    comment = comment_for(published)

    assert "_Issue at" not in comment


def test_a_relocated_comment_still_leads_with_the_nearest_line_note() -> None:
    """Rung 2 is a different claim from rung 1 and must keep saying so (§4.7)."""
    published = finding(start_line=30, end_line=30)

    comment = comment_for(published, line_map=LineMap(ORDERS, commentable_lines=frozenset({25})))

    assert comment.startswith("> Nearest reviewable line.")


# ---------------------------------------------------------------------------
# E26 reaches the new sections too
# ---------------------------------------------------------------------------


def test_a_secret_in_the_quoted_run_is_redacted_like_everything_else() -> None:
    leak = "ghp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

    comment = comment_for(
        finding(),
        outcome=proven_outcome(f"E   AssertionError: token was {leak}\n{FAILING_OUTPUT}"),
    )

    assert leak not in comment
    assert "***redacted***" in comment


def test_a_secret_in_the_remediation_is_redacted() -> None:
    leak = "sk-ant-CCCCCCCCCCCCCCCCCCCCCCCC"

    comment = comment_for(finding(remediation=f"Stop defaulting the key to {leak}."))

    assert leak not in comment


# ---------------------------------------------------------------------------
# The review body — their code first, our gate last
# ---------------------------------------------------------------------------


def test_the_body_opens_with_what_was_found_not_with_our_gate_mechanics() -> None:
    body = body_for(finding())
    headline = blocks(body)[1]

    assert headline.startswith("**1 issue to act on**")
    assert "1 proven by execution" in headline
    assert "merge-gate" not in headline


def test_the_body_lists_every_finding_as_something_to_act_on() -> None:
    second = finding(id="f-two", title="Restore the tenant filter.", start_line=9, end_line=9)

    body = body_for(finding(), second)

    assert "| Act on | Where | Severity | Proof |" in body
    assert f"| {IMPERATIVE_TITLE} | `{ORDERS}:6-15` |" in body
    assert f"| Restore the tenant filter. | `{ORDERS}:9` |" in body


def test_the_gate_explanation_is_one_line_at_the_bottom() -> None:
    parts = blocks(body_for(finding()))

    assert "merge-gate" in parts[-1]
    assert len(parts[-1].splitlines()) == 1
    assert not any("merge-gate" in part for part in parts[:-1])


def test_a_rung_four_finding_is_listed_once_and_explained_once() -> None:
    """The action table is the index; the rung-4 section says why one row has no comment."""
    stranded = finding(id="f-stranded", file_path="app/receipts.py", start_line=13, end_line=13)

    body = build_review_payload(
        findings=[stranded],
        assignments=assign_rungs([stranded], {}),
        files_reviewed=3,
    ).body

    assert SUMMARY_SECTION_HEADING in body
    assert body.count("`app/receipts.py:13`") == 2, "once in the table, once in the explanation"
    assert body.count(IMPERATIVE_TITLE) == 1


def test_the_body_never_reads_as_a_verdict_on_the_pull_request() -> None:
    """AC-14 in prose: nothing this module writes may look like a sign-off."""
    body = body_for(finding())

    for verdict in ("looks good", "lgtm", "ship it", "approved", "sign-off"):
        assert verdict not in body.lower()
