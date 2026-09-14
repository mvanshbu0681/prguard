"""S1 — resolve the pull request and fetch what S2 needs. Spec §4.1, §7 E16/E27, §8.1.

This is the one stage where a GitHub failure is **fatal**. Everywhere later a 403 is a
degradation — the payload is persisted and the run still succeeds (E17) — but a run that
could not read the diff has nothing to review, and inventing one would be the worst failure
mode this product has. So S1 maps four HTTP outcomes onto four run-level error codes and
raises; the pipeline records the code, writes `review.failed`, and stops.

The request path never comes here: `POST /v1/reviews` resolves nothing (§4.2, AC-1), which is
why `head_sha` is still `null` in the 202 body and why this module runs inside the worker.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Final

from prguard.core.context import ChangedFile
from prguard.core.delivery.github_client import (
    GitHubClient,
    GitHubError,
    GitHubForbiddenError,
    GitHubNotFoundError,
    GitHubRateLimitError,
)

#: `review_runs.error_code` values S1 can end a run with. The first three are §6.0 codes so
#: `GET /v1/reviews/{id}` can report them unchanged; the fourth has no HTTP counterpart
#: because "this PR changes nothing" is not a transport failure.
ERROR_PR_NOT_FOUND: Final[str] = "PR_NOT_FOUND"
ERROR_REPO_FORBIDDEN: Final[str] = "REPO_FORBIDDEN"
ERROR_GITHUB_UNAVAILABLE: Final[str] = "GITHUB_UNAVAILABLE"
ERROR_EMPTY_DIFF: Final[str] = "EMPTY_DIFF"

#: Recorded in `review_runs.degradations` when a referenced file could not be fetched (§8.1).
DEGRADATION_FILE_UNFETCHABLE: Final[str] = "context_file_unfetchable"

_CLOSED_STATES: Final[frozenset[str]] = frozenset({"closed", "merged"})
_DEV_NULL: Final[str] = "/dev/null"


class IngestError(Exception):
    """A fatal S1 failure, carrying the `error_code` the run will end with (E16)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PullRequestSnapshot:
    """Everything S1 learned about the pull request, in one immutable object.

    `title` and `description` are **user-controlled and unsanitised** here on purpose: this
    module reports what GitHub returned, and `core/sanitize.py` is applied at the seam where
    the text is about to reach a model (E15). Persisting a pre-sanitised title would quietly
    rewrite the PR's own words in our database.
    """

    owner: str
    name: str
    number: int
    head_sha: str
    base_sha: str
    head_ref: str | None = None
    base_ref: str | None = None
    title: str = ""
    description: str = ""
    author_login: str | None = None
    state: str | None = None
    url: str | None = None
    is_draft: bool = False
    default_branch: str | None = None
    external_repo_id: str | None = None
    files: tuple[ChangedFile, ...] = ()
    diff: str = ""

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"

    @property
    def is_closed(self) -> bool:
        """E19 — the PR was closed or merged. Known at S1; re-checked at S8 before posting."""
        return (self.state or "").lower() in _CLOSED_STATES


@dataclass(frozen=True)
class FetchedFiles:
    """The head bodies S2 asked for, and the paths GitHub would not give us (§8.1)."""

    contents: Mapping[str, str] = field(default_factory=dict)
    failures: Mapping[str, str] = field(default_factory=dict)

    @property
    def degradations(self) -> tuple[str, ...]:
        return (DEGRADATION_FILE_UNFETCHABLE,) if self.failures else ()


async def ingest(
    client: GitHubClient, *, owner: str, repo: str, number: int
) -> PullRequestSnapshot:
    """Resolve the PR and its changed files — spec §4.1 S1. Raises :class:`IngestError`.

    Two calls, both fatal on failure: the PR itself (for the head and base SHAs every later
    stage is anchored to) and its file list (the diff). A PR with no patch anywhere is fatal
    too — "no diff" is §4.1's own second fatal condition, and a review of nothing would be an
    empty claim with our name on it.
    """
    try:
        detail = await client.get_pull_request(owner, repo, number)
        entries = await client.list_pull_request_files(owner, repo, number)
    except GitHubError as error:
        raise _fatal(error, owner=owner, repo=repo, number=number) from error

    head = _section(detail, "head")
    base = _section(detail, "base")
    head_sha = str(head.get("sha") or "")
    base_sha = str(base.get("sha") or "")
    if not head_sha or not base_sha:
        raise IngestError(
            ERROR_PR_NOT_FOUND,
            f"GitHub returned no head/base SHA for {owner}/{repo}#{number}.",
        )

    files = tuple(ChangedFile.from_github(entry) for entry in entries)
    if not any(changed.patch for changed in files):
        raise IngestError(
            ERROR_EMPTY_DIFF,
            f"{owner}/{repo}#{number} has no reviewable diff; nothing was analysed.",
        )

    repository = _section(head, "repo") or _section(detail, "base").get("repo") or {}
    user = _section(detail, "user")
    return PullRequestSnapshot(
        owner=owner,
        name=repo,
        number=number,
        head_sha=head_sha,
        base_sha=base_sha,
        head_ref=_optional_str(head.get("ref")),
        base_ref=_optional_str(base.get("ref")),
        title=str(detail.get("title") or ""),
        description=str(detail.get("body") or ""),
        author_login=_optional_str(user.get("login")),
        state="merged" if detail.get("merged") else _optional_str(detail.get("state")),
        url=_optional_str(detail.get("html_url")),
        is_draft=bool(detail.get("draft")),
        default_branch=_optional_str(
            repository.get("default_branch") if isinstance(repository, dict) else None
        ),
        external_repo_id=_optional_str(
            repository.get("id") if isinstance(repository, dict) else None
        ),
        files=files,
        diff=unified_diff(files),
    )


async def fetch_file_bodies(
    client: GitHubClient | None,
    *,
    owner: str,
    repo: str,
    paths: Sequence[str],
    ref: str,
) -> FetchedFiles:
    """Fetch the head body of each path — §4.1 S2's on-demand fetch. **Degrading, never fatal.**

    A file we cannot read drops out of context and says so (§8.1). It is not fatal, but it is
    not free either: without the body, the fingerprint falls back to a line bucket (§4.5) and
    reachability is unknowable (E28), so the degradation is recorded rather than absorbed.
    """
    if client is None:
        return FetchedFiles(failures={path: "no GitHub client configured" for path in paths})

    contents: dict[str, str] = {}
    failures: dict[str, str] = {}
    for path in paths:
        try:
            contents[path] = await client.get_file_contents(owner, repo, path, ref=ref)
        except GitHubError as error:
            failures[path] = f"{type(error).__name__}: {error.github_message}"
    return FetchedFiles(contents=contents, failures=failures)


def unified_diff(files: Sequence[ChangedFile]) -> str:
    """Reassemble the changed files into one unified diff, for the prompts (§4.1 S2).

    GitHub hands back a patch per file with no file headers; a model shown a bare hunk cannot
    tell which file it is in. The headers are added back here rather than in the prompt
    builder, so the text the specialists see is a diff a human could apply.
    """
    sections: list[str] = []
    for changed in files:
        if not changed.patch:
            continue
        previous = changed.previous_path or changed.path
        left = _DEV_NULL if changed.change_status == "added" else f"a/{previous}"
        right = _DEV_NULL if changed.change_status == "removed" else f"b/{changed.path}"
        body = changed.patch if changed.patch.endswith("\n") else f"{changed.patch}\n"
        sections.append(
            f"diff --git a/{previous} b/{changed.path}\n--- {left}\n+++ {right}\n{body}"
        )
    return "".join(sections)


def _fatal(error: GitHubError, *, owner: str, repo: str, number: int) -> IngestError:
    """Map a transport failure onto the run's `error_code` — spec §8.1, §7 E16/E27.

    The order matters: a rate-limited 403 is a *different* 403 (E27) and must not be reported
    as "you do not have access to this repository", which would send someone to check a token
    that is fine.
    """
    target = f"{owner}/{repo}#{number}"
    if isinstance(error, GitHubRateLimitError):
        return IngestError(
            ERROR_GITHUB_UNAVAILABLE, f"GitHub rate limit reached while reading {target}."
        )
    if isinstance(error, GitHubNotFoundError):
        return IngestError(
            ERROR_PR_NOT_FOUND,
            f"{target} does not exist, or this token cannot see it.",
        )
    if isinstance(error, GitHubForbiddenError):
        return IngestError(
            ERROR_REPO_FORBIDDEN, f"This token may not read {target}: {error.github_message}"
        )
    return IngestError(
        ERROR_GITHUB_UNAVAILABLE, f"GitHub was unavailable while reading {target}: {error}"
    )


def _section(body: Mapping[str, Any], key: str) -> dict[str, Any]:
    value = body.get(key)
    return dict(value) if isinstance(value, dict) else {}


def _optional_str(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None


__all__ = [
    "DEGRADATION_FILE_UNFETCHABLE",
    "ERROR_EMPTY_DIFF",
    "ERROR_GITHUB_UNAVAILABLE",
    "ERROR_PR_NOT_FOUND",
    "ERROR_REPO_FORBIDDEN",
    "FetchedFiles",
    "IngestError",
    "PullRequestSnapshot",
    "fetch_file_bodies",
    "ingest",
    "unified_diff",
]
