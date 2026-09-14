"""Suite for the manifest-less service; stdlib only, so it runs uninstalled."""

import unittest

from svc.tokens import DIGEST_LENGTH, token_for, tokens_match


class TestTokens(unittest.TestCase):
    def test_token_is_stable_for_the_same_inputs(self):
        self.assertEqual(token_for("u-1", "s3cret"), token_for("u-1", "s3cret"))

    def test_token_length(self):
        self.assertEqual(len(token_for("u-1", "s3cret")), DIGEST_LENGTH)

    def test_matching_tokens_compare_equal(self):
        self.assertTrue(tokens_match(token_for("u-1", "s"), token_for("u-1", "s")))


if __name__ == "__main__":
    unittest.main()
