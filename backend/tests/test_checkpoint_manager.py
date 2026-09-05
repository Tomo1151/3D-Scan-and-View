import os
import time
import tempfile
import unittest
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.checkpoint_manager import is_checkpoint_valid

class TestCheckpointManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.checkpoint_path = os.path.join(self.test_dir.name, "test_checkpoint.pt")

    def tearDown(self):
        self.test_dir.cleanup()

    def test_nonexistent_checkpoint(self):
        self.assertFalse(is_checkpoint_valid(self.checkpoint_path))

    def test_too_small_checkpoint(self):
        # Files smaller than 1MB should be invalid
        with open(self.checkpoint_path, "wb") as f:
            f.write(b"x" * 100)
        self.assertFalse(is_checkpoint_valid(self.checkpoint_path))

    def test_valid_fresh_checkpoint(self):
        # Create a mock file > 1MB
        with open(self.checkpoint_path, "wb") as f:
            f.write(b"x" * (1024 * 1024 + 10))
        # Valid when fresh
        self.assertTrue(is_checkpoint_valid(self.checkpoint_path, ttl_seconds=86400))

    def test_expired_checkpoint(self):
        # Create a mock file > 1MB
        with open(self.checkpoint_path, "wb") as f:
            f.write(b"x" * (1024 * 1024 + 10))
        # Backdate the file modification time to 25 hours ago
        past_time = time.time() - (25 * 3600)
        os.utime(self.checkpoint_path, (past_time, past_time))

        # Check with 24-hour TTL (86400s)
        self.assertFalse(is_checkpoint_valid(self.checkpoint_path, ttl_seconds=86400))

if __name__ == '__main__':
    unittest.main()
