import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.device_utils import get_optimal_device, get_device_info

class TestDeviceUtils(unittest.TestCase):
    def test_get_optimal_device(self):
        device = get_optimal_device()
        self.assertIn(device, ["cuda", "mps", "cpu"])

    def test_get_device_info(self):
        info = get_device_info()
        self.assertIn("selected_device", info)
        self.assertIn("torch_version", info)
        self.assertIn("cuda_available", info)
        self.assertIn("mps_available", info)

if __name__ == '__main__':
    unittest.main()
