"""The suppression scope matrix (spec §5.1, §6.6, AC-9, E29).

A suppression is a human overriding the machine, so it has to be *exactly* as wide as the human
said and not one finding wider. ``test_scope_matrix`` therefore asserts in both directions: the
intended findings match **and no others do**. A ledger that quietly over-matches silences real
findings, which is the failure mode that ends trust in the gate.

T2 shipped :func:`suppression.matches` and its expiry/revocation guards (covered exhaustively in
``test_pinned_predicates.py``); this file covers the scope half T4 completed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from prguard.core import suppression
from prguard.core.types import CanonicalFinding, SuppressionRule, SuppressionScope

NOW = datetime(2026, 9, 14, 23, 0, 0, tzinfo=UTC)

TENANT = "t-1"
OTHER_TENANT = "t-2"
REPO = "r-1"
OTHER_REPO = "r-2"

FP_BILLING_DISCOUNT = "a1" * 32
FP_BILLING_EXCEPT = "b2" * 32
FP_CHECKOUT = "c3" * 32
FP_CLI_MAIN = "d4" * 32
FP_CLI_NESTED = "e5" * 32
FP_APP_ROUTES = "f6" * 32


def make_finding(
    finding_id: str,
    *,
    file_path: str,
    fingerprint: str,
    rule_key: str = "unguarded_none_arithmetic",
    tenant_id: str = TENANT,
    repository_id: str = REPO,
) -> CanonicalFinding:
    return CanonicalFinding(
        id=finding_id,
        tenant_id=tenant_id,
        repository_id=repository_id,
        specialist="bugs",
        category="correctness",
        rule_key=rule_key,
        title="…",
        body_markdown="…",
        file_path=file_path,
        start_line=41,
        end_line=44,
        side="RIGHT",
        language="python",
        symbol_path=f"{file_path}::f",
        fingerprint=fingerprint,
    )


#: One finding per interesting position in the matrix. Ids are the assertion vocabulary below.
POPULATION: tuple[CanonicalFinding, ...] = (
    make_finding("billing-discount", file_path="app/billing.py", fingerprint=FP_BILLING_DISCOUNT),
    make_finding(
        "billing-except",
        file_path="app/billing.py",
        fingerprint=FP_BILLING_EXCEPT,
        rule_key="bare_except",
    ),
    make_finding("checkout", file_path="app/checkout.py", fingerprint=FP_CHECKOUT),
    make_finding(
        "cli-main", file_path="cli/main.py", fingerprint=FP_CLI_MAIN, rule_key="bare_except"
    ),
    make_finding(
        "cli-nested",
        file_path="cli/cmd/run.py",
        fingerprint=FP_CLI_NESTED,
        rule_key="bare_except",
    ),
    make_finding("app-routes", file_path="app/api/routes.py", fingerprint=FP_APP_ROUTES),
    make_finding(
        "other-repo",
        file_path="app/billing.py",
        fingerprint=FP_BILLING_DISCOUNT,
        repository_id=OTHER_REPO,
    ),
    make_finding(
        "other-tenant",
        file_path="app/billing.py",
        fingerprint=FP_BILLING_DISCOUNT,
        tenant_id=OTHER_TENANT,
    ),
)

EVERY_ID = frozenset(finding.id for finding in POPULATION)


def make_rule(scope: SuppressionScope, **overrides: object) -> SuppressionRule:
    kwargs: dict[str, object] = {
        "id": "s-1",
        "tenant_id": TENANT,
        "scope": scope,
        "reason": "Discussed and accepted 2026-08-11.",
        "created_by": "vansh.m@shavastudios.ai",
        "created_at": NOW - timedelta(days=30),
    }
    kwargs.update(overrides)
    return SuppressionRule(**kwargs)  # type: ignore[arg-type]


def matched_ids(rule: SuppressionRule, *, now: datetime = NOW) -> frozenset[str]:
    return frozenset(
        finding.id
        for finding in POPULATION
        if suppression.matches(finding=finding, rule=rule, now=now)
    )


# ---------------------------------------------------------------------------
# AC-9 — the scope matrix, asserted in both directions
# ---------------------------------------------------------------------------

SCOPE_MATRIX: tuple[tuple[str, SuppressionRule, frozenset[str]], ...] = (
    (
        "line: one fingerprint in one repo — the narrowest rule there is",
        make_rule(
            "line",
            repository_id=REPO,
            match_path="app/billing.py",
            fingerprint=FP_BILLING_DISCOUNT,
        ),
        frozenset({"billing-discount"}),
    ),
    (
        "line: the same fingerprint tenant-wide reaches the other repo too",
        make_rule("line", fingerprint=FP_BILLING_DISCOUNT),
        frozenset({"billing-discount", "other-repo"}),
    ),
    (
        "file: every finding in one file, whatever its rule or fingerprint",
        make_rule("file", repository_id=REPO, match_path="app/billing.py"),
        frozenset({"billing-discount", "billing-except"}),
    ),
    (
        "pattern: a directory subtree, nested files included",
        make_rule("pattern", repository_id=REPO, match_path="cli/**"),
        frozenset({"cli-main", "cli-nested"}),
    ),
    (
        "pattern: a single directory level — `*` does not cross a slash",
        make_rule("pattern", repository_id=REPO, match_path="app/*.py"),
        frozenset({"billing-discount", "billing-except", "checkout"}),
    ),
    (
        "pattern: `**` does cross slashes",
        make_rule("pattern", repository_id=REPO, match_path="app/**"),
        frozenset({"billing-discount", "billing-except", "checkout", "app-routes"}),
    ),
    (
        "pattern: an exact path with no wildcard behaves like `file`",
        make_rule("pattern", repository_id=REPO, match_path="app/checkout.py"),
        frozenset({"checkout"}),
    ),
    (
        "repo: everything in one repository",
        make_rule("repo", repository_id=REPO),
        EVERY_ID - {"other-repo", "other-tenant"},
    ),
    (
        "repo + rule_key: one rule across one repository",
        make_rule("repo", repository_id=REPO, match_rule_key="bare_except"),
        frozenset({"billing-except", "cli-main", "cli-nested"}),
    ),
    (
        "tenant: everything in the tenant, across repositories, never across tenants",
        make_rule("tenant"),
        EVERY_ID - {"other-tenant"},
    ),
    (
        "tenant + rule_key: a convention accepted organisation-wide",
        make_rule("tenant", match_rule_key="bare_except"),
        frozenset({"billing-except", "cli-main", "cli-nested"}),
    ),
)


SCOPE_MATRIX_IDS = [
    f"{label.split(':')[0]}-{index}" for index, (label, _, _) in enumerate(SCOPE_MATRIX)
]


@pytest.mark.parametrize(("label", "rule", "expected"), SCOPE_MATRIX, ids=SCOPE_MATRIX_IDS)
def test_scope_matrix(label: str, rule: SuppressionRule, expected: frozenset[str]) -> None:
    """Both directions: these findings match, and every other finding does not."""
    matched = matched_ids(rule)
    assert matched == expected, label
    assert matched_ids(rule) & (EVERY_ID - expected) == frozenset(), label


def test_scope_matrix_population_is_not_degenerate() -> None:
    """Guard the guard: if every case matched everything the matrix would prove nothing."""
    covered = frozenset().union(*(expected for _, _, expected in SCOPE_MATRIX))
    assert covered == EVERY_ID - {"other-tenant"}
    assert any(expected != EVERY_ID for _, _, expected in SCOPE_MATRIX)


@pytest.mark.parametrize(
    ("pattern", "path", "expected"),
    [
        ("cli/**", "cli/main.py", True),
        ("cli/**", "cli/cmd/run.py", True),
        ("cli/**", "clients/main.py", False),
        ("cli/**", "app/cli/main.py", False),
        ("app/*.py", "app/billing.py", True),
        ("app/*.py", "app/api/routes.py", False),
        ("**/tests/**", "app/tests/test_x.py", True),
        ("**/*.md", "docs/readme.md", True),
        ("**/*.md", "readme.md", True),
        ("*.py", "billing.py", True),
        ("*.py", "app/billing.py", False),
        ("app/billing.py", "app/billing.py", True),
        ("app/billing.py", "app/billing.pyi", False),
        ("app/bill?ng.py", "app/billing.py", True),
        ("App/Billing.py", "app/billing.py", False),
    ],
)
def test_pattern_globbing_is_path_aware(pattern: str, path: str, expected: bool) -> None:
    """``*`` stops at a slash, ``**`` does not, and matching is case-sensitive like POSIX."""
    rule = make_rule("pattern", repository_id=REPO, match_path=pattern)
    finding = make_finding("probe", file_path=path, fingerprint=FP_CHECKOUT)
    assert suppression.matches(finding=finding, rule=rule, now=NOW) is expected


# ---------------------------------------------------------------------------
# Malformed ledger rows fail closed
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scope", "overrides"),
    [
        ("pattern", {}),
        ("file", {}),
        ("line", {"match_path": "app/billing.py"}),
        ("line", {}),
        ("repo", {}),
    ],
    ids=[
        "pattern-without-a-path",
        "file-without-a-path",
        "line-without-a-fingerprint",
        "line-with-nothing",
        "repo-without-a-repository",
    ],
)
def test_incomplete_rules_suppress_nothing(
    scope: SuppressionScope, overrides: dict[str, object]
) -> None:
    """A half-written ledger row must silence nothing, never everything."""
    assert matched_ids(make_rule(scope, **overrides)) == frozenset()


# ---------------------------------------------------------------------------
# AC-9 — expiry and revocation
# ---------------------------------------------------------------------------


def test_expired_does_not_suppress() -> None:
    rule = make_rule(
        "repo", repository_id=REPO, expires_at=NOW - timedelta(seconds=1)
    )
    assert matched_ids(rule) == frozenset()
    assert matched_ids(rule, now=NOW - timedelta(days=1)) != frozenset()


def test_expiry_is_exclusive_at_the_instant_it_lapses() -> None:
    rule = make_rule("repo", repository_id=REPO, expires_at=NOW)
    assert matched_ids(rule, now=NOW - timedelta(microseconds=1)) != frozenset()
    assert matched_ids(rule, now=NOW) == frozenset()


def test_revoke_is_soft_delete() -> None:
    """DELETE sets ``revoked_at``; the row survives as evidence and stops matching (§5.1)."""
    live = make_rule("repo", repository_id=REPO)
    assert matched_ids(live) != frozenset()

    revoked = make_rule("repo", repository_id=REPO, revoked_at=NOW - timedelta(minutes=5))
    assert matched_ids(revoked) == frozenset()
    assert revoked.id == live.id
    assert revoked.reason == live.reason
    assert revoked.created_by == live.created_by
    assert revoked.created_at == live.created_at


def test_a_revoked_rule_stays_revoked_however_far_back_you_look() -> None:
    """Revocation is not a time window: it ends the rule, it does not carve a hole in it."""
    revoked = make_rule("tenant", revoked_at=NOW)
    for offset in (-365, -1, 0, 1, 365):
        assert matched_ids(revoked, now=NOW + timedelta(days=offset)) == frozenset()


# ---------------------------------------------------------------------------
# E29 — a suppression outranks a later `proven` verdict
# ---------------------------------------------------------------------------


def test_suppression_still_matches_a_proven_finding() -> None:
    """E29: suppression wins, because the gate has to stay human-governable."""
    proven = make_finding(
        "proven-and-suppressed", file_path="app/billing.py", fingerprint=FP_BILLING_DISCOUNT
    )
    proven.proof_status = "proven"
    proven.severity = None
    rule = make_rule("line", repository_id=REPO, fingerprint=FP_BILLING_DISCOUNT)
    assert suppression.matches(finding=proven, rule=rule, now=NOW)
