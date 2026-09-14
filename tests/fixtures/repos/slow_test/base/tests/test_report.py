"""The suite that outlives `PROOF_TIMEOUT` (E11).

Never run by `verify_corpus.py` — it is committed so the proof runner has a
real process to kill, and asserting on it statically is the only sane check.
"""

import unittest

from app.report import build_report, summarise


class TestReport(unittest.TestCase):
    def test_summarise_is_fast(self):
        self.assertEqual(summarise([{"amount": 2}, {"amount": 3}])["total"], 5)

    def test_build_report_sleeps_past_the_proof_timeout(self):
        self.assertEqual(build_report([{"amount": 1}])["rows"], 1)


if __name__ == "__main__":
    unittest.main()
