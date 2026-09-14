"""The GitHub REST client — spec §4.3, §8.1, §7 E27. `httpx`, retries, typed failures.

Everything the pipeline does to GitHub goes through here, for one reason: **a failure has to
arrive as a decision, not as a stack trace.** Four HTTP outcomes mean four different things to
S8, and collapsing them loses the product's degradation story:

* **403** — the token cannot write here. Common, expected, and survivable: the payload is
  persisted and served from the API (E17). Also the Check Runs answer to a PAT (E18).
* **403 + `x-ratelimit-remaining: 0`** — a *different* 403. Wait for `x-ratelimit-reset`, but
  never longer than :data:`DEFAULT_MAX_WAIT_SECONDS`, then fail the stage (E27).
* **404** — the PR or repo is gone. Fatal in S1, degrading later.
* **422** — GitHub validated the request and named what it disliked. For a review that is the
  out-of-hunk comment, which is exactly the handle E2's demotion needs; hence
  :attr:`GitHubValidationError.rejected_comments`.

Transport errors and 5xx are retried :data:`MAX_ATTEMPTS` times with exponential backoff plus
jitter (fixed backoff would synchronise every worker onto the same instant). 4xx is never
retried — repeating a request GitHub understood and refused only spends rate limit.

The clock is injectable (``sleep``, ``jitter``) so the whole retry policy is testable offline
and instantly, which is what keeps VERIFY under §9.4's time budget.
"""

from __future__ import annotations

import asyncio
import base64
import random
from collections.abc import Awaitable, Callable
from email.utils import parsedate_to_datetime
from types import TracebackType
from typing import Any, Final, Self

import httpx

#: Spec §4.8 default.
GITHUB_API_BASE: Final[str] = "https://api.github.com"

#: Pinned so a future GitHub default cannot silently change a response shape under us.
GITHUB_API_VERSION: Final[str] = "2022-11-28"

ACCEPT_JSON: Final[str] = "application/vnd.github+json"

#: Spec §8.1 — "retry 3× with exponential backoff + jitter".
MAX_ATTEMPTS: Final[int] = 3

#: First backoff step, doubling each attempt.
BACKOFF_BASE_SECONDS: Final[float] = 0.5

#: Spec §7 E27's ``GITHUB_MAX_WAIT``. T1's ``Settings`` does not carry this key yet, so it is
#: a constructor argument defaulting to the spec's 60 s rather than a silent hardcode.
DEFAULT_MAX_WAIT_SECONDS: Final[float] = 60.0

DEFAULT_TIMEOUT_SECONDS: Final[float] = 30.0

USER_AGENT: Final[str] = "prguard/0.1"

_RETRYABLE_STATUSES: Final[frozenset[int]] = frozenset({500, 502, 503, 504})

Sleeper = Callable[[float], Awaitable[None]]
Jitter = Callable[[], float]


class GitHubError(Exception):
    """Base class for every GitHub failure. Carries enough to persist and explain itself."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        url: str = "",
        body: Any = None,
        headers: httpx.Headers | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
        self.body = body
        self.headers = headers

    @property
    def github_message(self) -> str:
        """GitHub's own ``message`` field, when the body had one."""
        if isinstance(self.body, dict):
            message = self.body.get("message")
            if isinstance(message, str):
                return message
        return str(self)


class GitHubForbiddenError(GitHubError):
    """403 — the token may not do this. Delivery degrades; the run still succeeds (E17/E18)."""


class GitHubRateLimitError(GitHubForbiddenError):
    """403/429 with the rate limit exhausted (E27).

    A subclass of :class:`GitHubForbiddenError` on purpose: S8 treats both as "could not post,
    persist the payload", and only the operator-facing detail differs.
    """

    def __init__(self, message: str, *, retry_after: float | None = None, **kwargs: Any) -> None:
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class GitHubNotFoundError(GitHubError):
    """404 — the resource is gone or was never visible to this token."""


class GitHubValidationError(GitHubError):
    """422 — GitHub understood the request and rejected part of it.

    :attr:`rejected_comments` is the ``(path, line)`` of each review comment it named, which is
    what the comment ladder demotes (§7 E2). Empty when the 422 was about something else.
    """

    @property
    def errors(self) -> tuple[dict[str, Any], ...]:
        if isinstance(self.body, dict) and isinstance(self.body.get("errors"), list):
            return tuple(item for item in self.body["errors"] if isinstance(item, dict))
        return ()

    @property
    def rejected_comments(self) -> tuple[tuple[str, int | None], ...]:
        """Every review comment GitHub named, as ``(path, line)``."""
        return tuple(
            (str(error["path"]), _as_int(error.get("line")))
            for error in self.errors
            if error.get("path")
        )


class GitHubUnavailableError(GitHubError):
    """5xx or a transport failure that survived every retry — spec §8.1, `GITHUB_UNAVAILABLE`."""


class GitHubClient:
    """A small, explicit GitHub client. One method per call S8 and the gate ladder make.

    Deliberately not a generic SDK: every method here is a call the spec names, so the set of
    things this product can do to someone's repository is readable in one screen.
    """

    def __init__(
        self,
        *,
        token: str | None = None,
        base_url: str = GITHUB_API_BASE,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_attempts: int = MAX_ATTEMPTS,
        max_wait_seconds: float = DEFAULT_MAX_WAIT_SECONDS,
        sleep: Sleeper | None = None,
        jitter: Jitter | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.max_attempts = max(1, max_attempts)
        self.max_wait_seconds = max_wait_seconds
        self._sleep: Sleeper = sleep or asyncio.sleep
        self._jitter: Jitter = jitter or random.random
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout, headers=self._default_headers()
        )

    # -- lifecycle ------------------------------------------------------------------

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # -- the calls the spec names ---------------------------------------------------

    async def get_pull_request(self, owner: str, repo: str, number: int) -> dict[str, Any]:
        """``GET /repos/{o}/{r}/pulls/{n}`` — re-read immediately before posting (E19)."""
        return await self._json("GET", f"/repos/{owner}/{repo}/pulls/{number}")

    async def list_pull_request_files(
        self, owner: str, repo: str, number: int
    ) -> list[dict[str, Any]]:
        """``GET /repos/{o}/{r}/pulls/{n}/files`` — the patches the line maps are built from."""
        payload = await self._request("GET", f"/repos/{owner}/{repo}/pulls/{number}/files")
        body = payload.json()
        return list(body) if isinstance(body, list) else []

    async def get_file_contents(self, owner: str, repo: str, path: str, *, ref: str) -> str:
        """``GET /repos/{o}/{r}/contents/{path}?ref=`` — S2's on-demand fetch (§4.1).

        Returns the decoded text. A 404 is a real answer here (the file is new at head, or the
        path was renamed) and arrives as :class:`GitHubNotFoundError` for S2 to degrade on;
        anything that is not a base64 text blob — a directory listing, a submodule — comes back
        as the empty string rather than as a lie about the file's contents.
        """
        body = await self._json(
            "GET", f"/repos/{owner}/{repo}/contents/{path}", params={"ref": ref}
        )
        if body.get("encoding") != "base64":
            return str(body.get("content") or "")
        raw = base64.b64decode(str(body.get("content") or ""))
        return raw.decode("utf-8", errors="replace")

    async def list_review_comments(
        self, owner: str, repo: str, number: int
    ) -> list[dict[str, Any]]:
        """``GET /repos/{o}/{r}/pulls/{n}/comments`` — what an earlier run already said (E3)."""
        response = await self._request("GET", f"/repos/{owner}/{repo}/pulls/{number}/comments")
        body = response.json()
        return list(body) if isinstance(body, list) else []

    async def create_review(
        self, owner: str, repo: str, number: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """``POST /repos/{o}/{r}/pulls/{n}/reviews`` — the one review a run may post (§4.7)."""
        return await self._json(
            "POST", f"/repos/{owner}/{repo}/pulls/{number}/reviews", json=payload
        )

    async def update_review_comment(
        self, owner: str, repo: str, comment_id: int, body: str
    ) -> dict[str, Any]:
        """``PATCH /repos/{o}/{r}/pulls/comments/{id}`` — re-review updates, never duplicates."""
        return await self._json(
            "PATCH", f"/repos/{owner}/{repo}/pulls/comments/{comment_id}", json={"body": body}
        )

    async def create_check_run(
        self, owner: str, repo: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """``POST /repos/{o}/{r}/check-runs`` — gate rung 1; App tokens only (E18)."""
        return await self._json("POST", f"/repos/{owner}/{repo}/check-runs", json=payload)

    async def create_commit_status(
        self, owner: str, repo: str, sha: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """``POST /repos/{o}/{r}/statuses/{sha}`` — gate rung 2, the PAT-friendly one."""
        return await self._json("POST", f"/repos/{owner}/{repo}/statuses/{sha}", json=payload)

    # -- transport ------------------------------------------------------------------

    async def _json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = await self._request(method, path, **kwargs)
        body = response.json() if response.content else {}
        return dict(body) if isinstance(body, dict) else {}

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """One request with the full retry policy. Raises a typed error or returns a 2xx."""
        last_error: GitHubError | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = await self._client.request(method, path, **kwargs)
            except httpx.HTTPError as transport_error:
                last_error = GitHubUnavailableError(
                    f"{method} {path} failed: {transport_error}", url=path
                )
                if attempt == self.max_attempts:
                    raise last_error from transport_error
                await self._backoff(attempt)
                continue

            if response.is_success:
                return response

            error = _classify(response, method=method, path=path)
            if isinstance(error, GitHubRateLimitError):
                wait = error.retry_after
                if wait is None or wait > self.max_wait_seconds or attempt == self.max_attempts:
                    raise error
                await self._sleep(wait)
                continue
            if response.status_code in _RETRYABLE_STATUSES and attempt < self.max_attempts:
                last_error = error
                await self._backoff(attempt)
                continue
            raise error

        raise last_error or GitHubUnavailableError(f"{method} {path} exhausted every attempt")

    async def _backoff(self, attempt: int) -> None:
        delay = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
        await self._sleep(delay + self._jitter() * BACKOFF_BASE_SECONDS)

    def _default_headers(self) -> dict[str, str]:
        headers = {
            "accept": ACCEPT_JSON,
            "x-github-api-version": GITHUB_API_VERSION,
            "user-agent": USER_AGENT,
        }
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        return headers


def _classify(response: httpx.Response, *, method: str, path: str) -> GitHubError:
    body = _safe_json(response)
    message = f"{method} {path} → {response.status_code}: {_message_of(body)}"
    shared: dict[str, Any] = {
        "status": response.status_code,
        "url": path,
        "body": body,
        "headers": response.headers,
    }
    if _is_rate_limited(response):
        return GitHubRateLimitError(
            message, retry_after=_retry_after(response), **shared
        )
    if response.status_code == 403:
        return GitHubForbiddenError(message, **shared)
    if response.status_code == 404:
        return GitHubNotFoundError(message, **shared)
    if response.status_code == 422:
        return GitHubValidationError(message, **shared)
    if response.status_code >= 500:
        return GitHubUnavailableError(message, **shared)
    return GitHubError(message, **shared)


def _is_rate_limited(response: httpx.Response) -> bool:
    """E27's signature: it is the exhausted-remaining header, not the status, that decides."""
    if response.status_code not in (403, 429):
        return False
    remaining: str | None = response.headers.get("x-ratelimit-remaining")
    return remaining == "0"


def _retry_after(response: httpx.Response) -> float | None:
    """Seconds to wait before retrying, in GitHub's documented order of precedence.

    ``retry-after`` wins when present (it is what GitHub sends for a secondary limit and it is
    already relative, so no clock comparison can go wrong). Otherwise the wait is measured to
    ``x-ratelimit-reset`` against the ``date`` header — GitHub's clock, not ours, because a
    skewed local clock would otherwise turn a 30 s wait into an hour.
    """
    explicit = _as_float(response.headers.get("retry-after"))
    if explicit is not None:
        return max(0.0, explicit)
    reset = _as_int(response.headers.get("x-ratelimit-reset"))
    now = _response_time(response)
    if reset is None or now is None:
        return None
    return max(0.0, reset - now)


def _response_time(response: httpx.Response) -> float | None:
    raw = response.headers.get("date")
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw).timestamp()
    except (TypeError, ValueError):
        return None


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


def _message_of(body: Any) -> str:
    if isinstance(body, dict) and isinstance(body.get("message"), str):
        return str(body["message"])
    return str(body)[:200]


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "ACCEPT_JSON",
    "BACKOFF_BASE_SECONDS",
    "DEFAULT_MAX_WAIT_SECONDS",
    "GITHUB_API_BASE",
    "GITHUB_API_VERSION",
    "MAX_ATTEMPTS",
    "GitHubClient",
    "GitHubError",
    "GitHubForbiddenError",
    "GitHubNotFoundError",
    "GitHubRateLimitError",
    "GitHubUnavailableError",
    "GitHubValidationError",
]
