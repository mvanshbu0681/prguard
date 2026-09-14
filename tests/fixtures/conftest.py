"""Keeps pytest out of the fixture repos.

`tests/fixtures/repos/**` contains whole miniature repositories, several of which are
*supposed* to be red — `buggy_calc/head` raises the seeded TypeError and
`pre_existing_failure` is broken at both refs. Collecting them into this project's own
suite would fail the build for the wrong reason, and `slow_test` would hang it for two
minutes. They are data: the proof runner copies a tree into a workspace and runs it there.

Package-level conftest by design — plan §9.3 freezes the root `tests/conftest.py`.
"""

collect_ignore_glob = ["repos/*"]
