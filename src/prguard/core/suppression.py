"""The suppression ledger — S6 of the pipeline. Pure matching, no I/O (spec §5.1, §6.6, E29).

**Ownership seam.** T2 owns :func:`matches` — the guards that make the ledger trustworthy
(tenant isolation, expiry, revocation) — and a first cut of :func:`_scope_matches`. T4 owns the
full scope matrix (AC-9) and completes ``_scope_matches`` in wave 2; it should not need to
touch :func:`matches` itself.

The ledger is append-only: ``DELETE /v1/suppressions/{id}`` sets ``revoked_at`` rather than
removing the row, because a ledger you can silently edit is not audit evidence. Both of the
"stopped applying" cases therefore have to be decided here, at match time.
"""

from __future__ import annotations

from datetime import UTC, datetime
from fnmatch import fnmatchcase

from prguard.core.types import CanonicalFinding, SuppressionRule


def matches(*, finding: CanonicalFinding, rule: SuppressionRule, now: datetime) -> bool:
    """Whether ``rule`` suppresses ``finding`` at instant ``now``.

    The guards, in order — each one fails closed:

    1. **Tenant.** A rule never reaches across tenants, whatever its scope.
    2. **Revocation.** A revoked rule stops matching immediately; its row survives (§5.1).
    3. **Expiry.** ``expires_at`` is exclusive: at the instant it expires it no longer
       suppresses (AC-9, "an ``expires_at`` in the past does not suppress").
    4. **Identity narrowing.** ``fingerprint`` and ``match_rule_key``, when set, must agree.
    5. **Scope.** Delegated to :func:`_scope_matches`.

    A match is a *human decision* and outranks everything downstream, including a later
    ``proven`` verdict (E29) — the caller records ``override.break_glass`` in that case.
    """
    if rule.tenant_id != finding.tenant_id:
        return False
    if rule.revoked_at is not None:
        return False
    if rule.expires_at is not None and _as_utc(rule.expires_at) <= _as_utc(now):
        return False
    if rule.repository_id is not None and rule.repository_id != finding.repository_id:
        return False
    if rule.fingerprint is not None and rule.fingerprint != finding.fingerprint:
        return False
    if rule.match_rule_key is not None and rule.match_rule_key != finding.rule_key:
        return False
    return _scope_matches(finding=finding, rule=rule)


def _scope_matches(*, finding: CanonicalFinding, rule: SuppressionRule) -> bool:
    """Path/identity part of the scope matrix (spec §5.1 ``scope``).

    T2 ships this first cut; **T4 completes the matrix** for AC-9
    (``tests/core/test_suppression.py::test_scope_matrix``). Tenant and repository narrowing
    has already been applied by :func:`matches` before this is called.

    * ``tenant`` / ``repo`` — no further narrowing; the ledger row's own ``repository_id``
      already bounded it.
    * ``file`` — exact path equality.
    * ``pattern`` — glob against ``match_path``; a pattern rule with no path matches nothing.
    * ``line`` — the identity scope: the fingerprint pins the symbol (fingerprints carry no
      line numbers, §4.5), and ``match_path`` pins the file when present.
    """
    if rule.scope in ("tenant", "repo"):
        return True
    if rule.scope == "pattern":
        if rule.match_path is None:
            return False
        return _path_matches(pattern=rule.match_path, path=finding.file_path)
    if rule.scope in ("file", "line"):
        if rule.match_path is None:
            return rule.scope == "line" and rule.fingerprint is not None
        return rule.match_path == finding.file_path
    return False


def _path_matches(*, pattern: str, path: str) -> bool:
    """Glob a POSIX repo path. ``cli/**`` matches ``cli/main.py`` and ``cli/cmd/run.py``."""
    return fnmatchcase(path, pattern) or fnmatchcase(path, pattern.replace("**", "*"))


def _as_utc(moment: datetime) -> datetime:
    """Treat a naive timestamp as UTC — a SQLite round-trip drops ``tzinfo`` (§5)."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment
