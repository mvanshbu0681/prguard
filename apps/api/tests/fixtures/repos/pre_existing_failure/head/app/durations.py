"""Duration parsing for the scheduler.

Already broken before the PR under review: ``parse_duration`` silently
ignores the minutes suffix. The repo is red at base *and* at head, so any
repro that trips over it is `inconclusive`, never `proven` (spec §7 E13).
"""

SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600


def parse_duration(text):
    """Return ``text`` (e.g. ``"90s"``) as a number of seconds."""
    digits = "".join(character for character in text if character.isdigit())
    if not digits:
        raise ValueError("no digits in duration {0!r}".format(text))
    return int(digits)


def humanise(seconds):
    """Return a short human rendering of ``seconds``."""
    if seconds < SECONDS_PER_MINUTE:
        return "{0}s".format(seconds)
    if seconds < SECONDS_PER_HOUR:
        return "{0}m".format(seconds // SECONDS_PER_MINUTE)
    return "{0}h".format(seconds // SECONDS_PER_HOUR)
