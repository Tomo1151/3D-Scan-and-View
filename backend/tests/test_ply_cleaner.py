import os
import tempfile
import unittest
import numpy as np
from plyfile import PlyData, PlyElement
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.ply_cleaner import clean_3dgs_ply

class TestPlyCleaner(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.input_ply = os.path.join(self.test_dir.name, "input.ply")
        self.output_ply = os.path.join(self.test_dir.name, "output.ply")

    def tearDown(self):
        self.test_dir.cleanup()

    def test_clean_3dgs_ply(self):
        SH_C0 = 0.28209479177387814

        # Create 50 valid points forming a dense cluster around (0, 0, 0) with bright color
        n_valid = 50
        x_val = np.random.normal(0, 0.1, n_valid).astype(np.float32)
        y_val = np.random.normal(0, 0.1, n_valid).astype(np.float32)
        z_val = np.random.normal(0, 0.1, n_valid).astype(np.float32)
        # Bright color: R=0.8, G=0.8, B=0.8
        f_dc_0_val = np.full(n_valid, (0.8 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_1_val = np.full(n_valid, (0.8 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_2_val = np.full(n_valid, (0.8 - 0.5) / SH_C0, dtype=np.float32)

        # Create 10 black noise points (near cluster, but black color: R,G,B = 0.005)
        n_black = 10
        x_blk = np.random.normal(0, 0.1, n_black).astype(np.float32)
        y_blk = np.random.normal(0, 0.1, n_black).astype(np.float32)
        z_blk = np.random.normal(0, 0.1, n_black).astype(np.float32)
        f_dc_0_blk = np.full(n_black, (0.005 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_1_blk = np.full(n_black, (0.005 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_2_blk = np.full(n_black, (0.005 - 0.5) / SH_C0, dtype=np.float32)

        # Create 3 isolated outlier points far away with bright color
        n_outliers = 3
        x_out = np.array([50.0, -50.0, 30.0], dtype=np.float32)
        y_out = np.array([50.0, -50.0, 30.0], dtype=np.float32)
        z_out = np.array([50.0, -50.0, 30.0], dtype=np.float32)
        f_dc_0_out = np.full(n_outliers, (0.8 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_1_out = np.full(n_outliers, (0.8 - 0.5) / SH_C0, dtype=np.float32)
        f_dc_2_out = np.full(n_outliers, (0.8 - 0.5) / SH_C0, dtype=np.float32)

        # Concatenate
        x = np.concatenate([x_val, x_blk, x_out])
        y = np.concatenate([y_val, y_blk, y_out])
        z = np.concatenate([z_val, z_blk, z_out])
        f_dc_0 = np.concatenate([f_dc_0_val, f_dc_0_blk, f_dc_0_out])
        f_dc_1 = np.concatenate([f_dc_1_val, f_dc_1_blk, f_dc_1_out])
        f_dc_2 = np.concatenate([f_dc_2_val, f_dc_2_blk, f_dc_2_out])

        total = len(x)
        opacity = np.full(total, 1.0, dtype=np.float32)
        scale_0 = np.full(total, -3.0, dtype=np.float32)
        scale_1 = np.full(total, -3.0, dtype=np.float32)
        scale_2 = np.full(total, -3.0, dtype=np.float32)
        rot_0 = np.ones(total, dtype=np.float32)
        rot_1 = np.zeros(total, dtype=np.float32)
        rot_2 = np.zeros(total, dtype=np.float32)
        rot_3 = np.zeros(total, dtype=np.float32)

        vertex_dt = np.dtype([
            ('x', 'f4'), ('y', 'f4'), ('z', 'f4'),
            ('f_dc_0', 'f4'), ('f_dc_1', 'f4'), ('f_dc_2', 'f4'),
            ('opacity', 'f4'),
            ('scale_0', 'f4'), ('scale_1', 'f4'), ('scale_2', 'f4'),
            ('rot_0', 'f4'), ('rot_1', 'f4'), ('rot_2', 'f4'), ('rot_3', 'f4'),
        ])
        verts = np.empty(total, dtype=vertex_dt)
        verts['x'] = x; verts['y'] = y; verts['z'] = z
        verts['f_dc_0'] = f_dc_0; verts['f_dc_1'] = f_dc_1; verts['f_dc_2'] = f_dc_2
        verts['opacity'] = opacity
        verts['scale_0'] = scale_0; verts['scale_1'] = scale_1; verts['scale_2'] = scale_2
        verts['rot_0'] = rot_0; verts['rot_1'] = rot_1; verts['rot_2'] = rot_2; verts['rot_3'] = rot_3

        el = PlyElement.describe(verts, 'vertex')
        PlyData([el]).write(self.input_ply)

        # Run cleaning
        res = clean_3dgs_ply(
            self.input_ply,
            self.output_ply,
            black_thresh=0.015,
            outlier_k=10,
            outlier_std_ratio=1.5,
            rotation_deg=90.0
        )

        self.assertEqual(res["input_points"], total)
        self.assertEqual(res["black_removed"], n_black)
        self.assertGreater(res["outliers_removed"], 0)
        self.assertTrue(os.path.isfile(self.output_ply))

        # Check that output PLY can be read and still has all properties
        out_ply = PlyData.read(self.output_ply)
        out_verts = out_ply['vertex'].data
        self.assertIn('f_dc_0', out_verts.dtype.names)
        self.assertIn('rot_0', out_verts.dtype.names)
        self.assertEqual(len(out_verts), res["final_points"])

if __name__ == '__main__':
    unittest.main()
