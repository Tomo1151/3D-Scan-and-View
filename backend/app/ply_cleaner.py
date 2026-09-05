import os
import logging
import numpy as np
from plyfile import PlyData, PlyElement
from scipy.spatial import cKDTree
from app import config

logger = logging.getLogger(__name__)

def clean_3dgs_ply(
    input_path: str,
    output_path: str,
    black_thresh: float = config.BLACK_THRESH,
    outlier_k: int = config.OUTLIER_K,
    outlier_std_ratio: float = config.OUTLIER_STD_RATIO,
    rotation_deg: float = 0.0
) -> dict:
    """
    Cleans a 3DGS PLY file generated from a background-removed image.
    1. Removes black noise splats created by the transparent/black background.
    2. Removes floating outlier splats using cKDTree nearest neighbor distance.
    3. Optionally rotates the coordinates and quaternions around the Y-axis.
    Preserves all original 3DGS vertex properties.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input PLY file not found: {input_path}")
        
    logger.info(f"Reading PLY file: {input_path}")
    plydata = PlyData.read(input_path)
    vertex_data = plydata['vertex'].data.copy()
    init_points = len(vertex_data)
    
    # 1. 黒色ノイズの削除（3DGSは f_dc_0 ~ 2 に基本色を持つ）
    black_removed = 0
    if 'f_dc_0' in vertex_data.dtype.names:
        SH_C0 = 0.28209479177387814
        r = vertex_data['f_dc_0'] * SH_C0 + 0.5
        g = vertex_data['f_dc_1'] * SH_C0 + 0.5
        b = vertex_data['f_dc_2'] * SH_C0 + 0.5
        valid_mask = ~((r < black_thresh) & (g < black_thresh) & (b < black_thresh))
        pts_before = len(vertex_data)
        vertex_data = vertex_data[valid_mask]
        black_removed = pts_before - len(vertex_data)
        logger.info(f"Removed {black_removed} black noise splats (Thresh: {black_thresh})")
    
    # 2. 孤立点の削除 (cKDTreeを使用)
    outliers_removed = 0
    if len(vertex_data) > outlier_k:
        xyz = np.vstack((vertex_data['x'], vertex_data['y'], vertex_data['z'])).T
        tree = cKDTree(xyz)
        dist, _ = tree.query(xyz, k=outlier_k + 1)
        mean_dist = np.mean(dist[:, 1:], axis=1)
        thresh = np.mean(mean_dist) + outlier_std_ratio * np.std(mean_dist)
        inlier_mask = mean_dist < thresh
        pts_before = len(vertex_data)
        vertex_data = vertex_data[inlier_mask]
        outliers_removed = pts_before - len(vertex_data)
        logger.info(f"Removed {outliers_removed} outlier splats (k={outlier_k}, std_ratio={outlier_std_ratio})")

    # 3. Y軸周りの回転（座標とクォータニオンの両方を回転）
    if rotation_deg != 0.0:
        rad = np.radians(rotation_deg)
        cos_a = np.cos(rad)
        sin_a = np.sin(rad)

        # XYZ座標の回転
        x_new = vertex_data['x'] * cos_a + vertex_data['z'] * sin_a
        z_new = -vertex_data['x'] * sin_a + vertex_data['z'] * cos_a
        vertex_data['x'] = x_new
        vertex_data['z'] = z_new

        # 3DGSスプラットの向き（クォータニオン）の回転
        if 'rot_0' in vertex_data.dtype.names:
            w1, y1 = np.cos(rad / 2), np.sin(rad / 2) # Y軸回転のクォータニオン
            w2 = vertex_data['rot_0'].copy()
            x2 = vertex_data['rot_1'].copy()
            y2 = vertex_data['rot_2'].copy()
            z2 = vertex_data['rot_3'].copy()

            # クォータニオンの掛け算
            vertex_data['rot_0'] = w1 * w2 - y1 * y2
            vertex_data['rot_1'] = w1 * x2 + y1 * z2
            vertex_data['rot_2'] = w1 * y2 + y1 * w2
            vertex_data['rot_3'] = w1 * z2 - y1 * x2
        logger.info(f"Rotated coordinates and quaternions by {rotation_deg} degrees around Y-axis")

    # 4. 基本RGBカラーの付与 (3DGSのSH f_dc から標準PLYビューア互換のRGBを生成)
    if 'f_dc_0' in vertex_data.dtype.names and 'red' not in vertex_data.dtype.names:
        SH_C0 = 0.28209479177387814
        r_val = np.clip(vertex_data['f_dc_0'] * SH_C0 + 0.5, 0.0, 1.0)
        g_val = np.clip(vertex_data['f_dc_1'] * SH_C0 + 0.5, 0.0, 1.0)
        b_val = np.clip(vertex_data['f_dc_2'] * SH_C0 + 0.5, 0.0, 1.0)

        new_dtype = vertex_data.dtype.descr + [('red', 'u1'), ('green', 'u1'), ('blue', 'u1')]
        new_vertex_data = np.empty(vertex_data.shape, dtype=new_dtype)
        for name in vertex_data.dtype.names:
            new_vertex_data[name] = vertex_data[name]
        new_vertex_data['red'] = (r_val * 255).astype(np.uint8)
        new_vertex_data['green'] = (g_val * 255).astype(np.uint8)
        new_vertex_data['blue'] = (b_val * 255).astype(np.uint8)
        vertex_data = new_vertex_data
        logger.info("Added standard RGB color fields from 3DGS spherical harmonics.")

    # 5. 保存
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    el = PlyElement.describe(vertex_data, 'vertex')
    PlyData([el]).write(output_path)
    
    final_points = len(vertex_data)
    logger.info(f"Cleaned PLY saved to: {output_path} (Points: {init_points} -> {final_points})")

    return {
        "input_points": init_points,
        "final_points": final_points,
        "black_removed": black_removed,
        "outliers_removed": outliers_removed,
        "output_path": output_path
    }
