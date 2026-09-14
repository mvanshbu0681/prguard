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

import re
from datetime import UTC, datetime
from functools import lru_cache

from prguard.core.types import CanonicalFinding, SuppressionRule


def matches(*, finding: CanonicalFinding, rule: SuppressionRule, now: datetime) -> bool:
    """Whether ``rule`` suppresses ``finding`` at instant ``now``.

    The guards, in order — each one fails closed:

    1. **Tenant.** A rule never reaches across tenants, whatever its scope.
    2. **Revocation.** A revoked rule stops matching immediately; its row survives (§5.1).
    3. **Expiry.** ``expires_at`` is exclusive: at the instant it expires it no longer
       suppresses (AC-9, "an ``expires_at`` in the past does not suppress").
    4. **Repository.** Delegated to :func:`_repository_in_scope`, because ``tenant`` is the
       one scope that must be able to reach past the repository the row was written from.
    5. **Identity narrowing.** ``fingerprint`` and ``match_rule_key``, when set, must agree.
    6. **Scope.** Delegated to :func:`_scope_matches`.

    A match is a *human decision* and outranks everything downstream, including a later
    ``proven`` verdict (E29) — the caller records ``override.break_glass`` in that case.
    """
    if rule.tenant_id != finding.tenant_id:
        return False
    if rule.revoked_at is not None:
        return False
    if rule.expires_at is not None and _as_utc(rule.expires_at) <= _as_utc(now):
        return False
    if not _repository_in_scope(finding=finding, rule=rule):
        return False
    if rule.fingerprint is not None and rule.fingerprint != finding.fingerprint:
        return False
    if rule.match_rule_key is not None and rule.match_rule_key != finding.rule_key:
        return False
    return _scope_matches(finding=finding, rule=rule)


def _repository_in_scope(*, finding: CanonicalFinding, rule: SuppressionRule) -> bool:
    """Repository narrowing — applied to every scope **except** ``tenant`` (§5.1, AC-9).

    ``POST /v1/findings/{id}/suppress`` records ``repository_id`` on every row, because a
    ledger entry that cannot say which repository a human was looking at is poor evidence.
    Running that column as an unconditional narrowing made ``scope="tenant"`` unreachable:
    the widest rule we offer could never leave the first repository it was written in, which
    is the opposite of what the scope means.
    """
    if rule.scope == "tenant":
        return True
    return rule.repository_id is None or rule.repository_id == finding.repository_id


def _scope_matches(*, finding: CanonicalFinding, rule: SuppressionRule) -> bool:
    """Path/identity part of the scope matrix (spec §5.1 ``scope``, AC-9).

    Tenant and repository narrowing has already been applied by :func:`matches`; what is left
    is how wide the human meant the rule to be. Every branch **fails closed** — a ledger row
    that is missing the field its scope depends on suppresses nothing, because the alternative
    is a half-written row silencing a whole repository.

    * ``tenant`` — the whole tenant. The widest rule we offer, and the only one that needs no
      further narrowing at all.
    * ``repo`` — one repository; the row must actually name one.
    * ``file`` — exact path equality. §6.6 ignores the request body's ``match_path`` for this
      scope, so the route records the *finding's* path on the row; a row without one is a row
      that names no file and suppresses nothing.
    * ``pattern`` — a path-aware glob (see :func:`_path_matches`), never the bare ``fnmatch``
      whose ``*`` happily crosses directory separators.
    * ``line`` — the narrowest scope, and an *identity* rather than a location: fingerprints
      carry no line numbers (§4.5), so what pins it is the fingerprint, optionally narrowed to
      one path. Without a fingerprint a ``line`` rule would silently widen to a whole file,
      which is a different decision than the one the human made.
    """
    if rule.scope == "tenant":
        return True
    if rule.scope == "repo":
        return rule.repository_id is not None
    if rule.scope == "pattern":
        if rule.match_path is None:
            return False
        return _path_matches(pattern=rule.match_path, path=finding.file_path)
    if rule.scope == "file":
        return rule.match_path is not None and rule.match_path == finding.file_path
    if rule.scope == "line":
        if rule.fingerprint is None:
            return False
        return rule.match_path is None or rule.match_path == finding.file_path
    return False


def _path_matches(*, pattern: str, path: str) -> bool:
    """Glob a POSIX repo path, with ``*`` bounded by directory separators.

    ``cli/**`` matches ``cli/main.py`` and ``cli/cmd/run.py``; ``app/*.py`` matches
    ``app/billing.py`` but **not** ``app/api/routes.py``. That distinction is the whole reason
    this is not ``fnmatch``: ``fnmatch``'s ``*`` crosses ``/``, so ``app/*.py`` would quietly
    suppress every Python file in every subdirectory — findings a human never agreed to lose.
    """
    return _compile(pattern).match(path) is not None


@lru_cache(maxsize=512)
def _compile(pattern: str) -> re.Pattern[str]:
    """Translate a repo-path glob to a regex. Cached: a ledger re-matches the same few rules."""
    out: list[str] = []
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if pattern.startswith("**/", index):
            out.append("(?:[^/]+/)*")
            index += 3
        elif pattern.startswith("**", index):
            out.append(".*")
            index += 2
        elif char == "*":
            out.append("[^/]*")
            index += 1
        elif char == "?":
            out.append("[^/]")
            index += 1
        elif char == "[":
            closing = pattern.find("]", index + 1)
            if closing == -1:
                out.append(re.escape(char))
                index += 1
            else:
                body = pattern[index + 1 : closing].replace("\\", "\\\\")
                out.append(f"[{'^' + body[1:] if body.startswith('!') else body}]")
                index = closing + 1
        else:
            out.append(re.escape(char))
            index += 1
    return re.compile(f"(?s:{''.join(out)})\\Z")


def _as_utc(moment: datetime) -> datetime:
    """Treat a naive timestamp as UTC — a SQLite round-trip drops ``tzinfo`` (§5)."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment
