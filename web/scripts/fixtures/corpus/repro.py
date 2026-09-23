"""Helpers for writing repro tests and describing how pytest reports them.

A repro is the file the proof generator writes (§4.6): a docstring stating the claim, the imports
it needs, optional autouse fixtures, and one test function whose **last statement** is the
assertion the claim turns on. Test functions never take fixture arguments, because pytest would
print their ``repr`` (with a memory address) into the captured output.
"""

from __future__ import annotations

from corpus.model import FailureSpec, Proof


def repro_file(
    *,
    target: str,
    claim: str,
    imports: tuple[str, ...],
    test_name: str,
    body: tuple[str, ...],
    setup: tuple[str, ...] = (),
) -> str:
    """The whole test file. ``body`` lines are the test's statements, unindented."""
    lines = [f'"""Repro for a prguard finding in {target}.', "", f"Claim: {claim}", '"""', ""]
    lines.extend(imports)
    if setup:
        lines.extend(["", ""])
        lines.extend(setup)
    lines.extend(["", "", f"def {test_name}():"])
    lines.extend(f"    {statement}" for statement in body)
    return "\n".join(lines) + "\n"


def assertion(*message: str) -> FailureSpec:
    """An ``assert`` that pytest rewrote.

    pytest strips ``AssertionError: `` from the first ``E`` line only when the exception's repr
    starts with ``AssertionError('assert `` — i.e. when the message contains no single quote, or
    contains both quote kinds. Verified against pytest 9.1.1.
    """
    joined = "\n".join(message)
    keep_prefix = "'" in joined and '"' not in joined
    first, *rest = message
    return FailureSpec(
        exception="AssertionError",
        explanation=(("AssertionError: " if keep_prefix else "") + first, *rest),
    )


def eq_call(actual: str, expected: str, call: str) -> FailureSpec:
    """``assert f(x) == y``: the value, then pytest's ``where`` line naming the call."""
    return assertion(f"assert {actual} == {expected}", f" +  where {actual} = {call}")


def list_has_extra(item: str) -> FailureSpec:
    """``assert leaked == []`` where ``leaked`` holds one item."""
    return assertion(
        f"assert [{item}] == []", "  ", f"  Left contains one more item: {item}",
        "  Use -v to get more diff",
    )


def raised(exception: str, message: str, caret: str) -> FailureSpec:
    """An exception raised by the failing line itself; pytest underlines ``caret``."""
    return FailureSpec(exception=exception, explanation=(f"{exception}: {message}",), caret=caret)


def did_not_raise(exception: str) -> FailureSpec:
    return FailureSpec(
        exception="Failed",
        explanation=(f"Failed: DID NOT RAISE {exception}",),
        caret=f"pytest.raises({exception})",
    )


def proof(
    kind: str,
    *,
    target: str,
    claim: str,
    imports: tuple[str, ...],
    test_name: str,
    body: tuple[str, ...],
    signal: str,
    failure: FailureSpec | None = None,
    setup: tuple[str, ...] = (),
    base_seconds: float = 0.31,
    head_seconds: float = 0.29,
    missing_module: str | None = None,
) -> Proof:
    return Proof(
        kind=kind,
        test_name=test_name,
        test_code=repro_file(
            target=target, claim=claim, imports=imports, test_name=test_name, body=body,
            setup=setup,
        ),
        signal=signal,
        failure=failure,
        base_seconds=base_seconds,
        head_seconds=head_seconds,
        missing_module=missing_module,
    )


def test_function_source(test_code: str, test_name: str) -> tuple[tuple[str, ...], int]:
    """The failing entry pytest prints (``def`` → last statement) and the failing line number."""
    lines = test_code.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(f"def {test_name}("))
    end = start
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("    "):
            end = index
        elif lines[index].strip():
            break
    return tuple(lines[start : end + 1]), end + 1
