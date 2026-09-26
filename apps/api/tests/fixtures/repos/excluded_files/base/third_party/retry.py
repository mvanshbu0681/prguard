"""Another vendored path (`third_party/`), same exclusion reason as `vendor/`."""

import time


def retry(callable_, attempts=3, delay=0.01):
    last = None
    for _ in range(attempts):
        try:
            return callable_()
        except Exception as exc:  # noqa: BLE001 - vendored code, kept verbatim
            last = exc
            time.sleep(delay)
    raise last
