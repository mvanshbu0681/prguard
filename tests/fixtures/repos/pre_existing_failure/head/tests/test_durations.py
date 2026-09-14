"""Already red at base: minutes have never been parsed correctly."""

import unittest

from app.durations import humanise, parse_duration


class TestParseDuration(unittest.TestCase):
    def test_seconds(self):
        self.assertEqual(parse_duration("90s"), 90)

    def test_minutes(self):
        self.assertEqual(parse_duration("2m"), 120)


class TestHumanise(unittest.TestCase):
    def test_under_a_minute(self):
        self.assertEqual(humanise(30), "30s")


if __name__ == "__main__":
    unittest.main()
