import os
import time
import glob
import logging
import requests
from typing import Callable, Optional
from pathlib import Path
from app import config

logger = logging.getLogger(__name__)

def is_checkpoint_valid(checkpoint_path: str, ttl_seconds: int = config.CHECKPOINT_CACHE_TTL_SECONDS) -> bool:
    """Checks if checkpoint exists, is non-empty, and was modified within ttl_seconds (default 24h)."""
    if not os.path.isfile(checkpoint_path):
        return False
    
    file_size = os.path.getsize(checkpoint_path)
    if file_size < 1024 * 1024 * 500:  # The model is ~2.8GB; under 500MB is definitely incomplete
        return False
        
    mtime = os.path.getmtime(checkpoint_path)
    age_seconds = time.time() - mtime
    if age_seconds < ttl_seconds:
        logger.info(f"Checkpoint cache is valid (Age: {age_seconds / 3600:.1f}h / TTL: {ttl_seconds / 3600:.1f}h)")
        return True
    
    logger.info(f"Checkpoint cache expired (Age: {age_seconds / 3600:.1f}h > TTL: {ttl_seconds / 3600:.1f}h)")
    return False

def find_any_existing_checkpoint(models_dir: str = config.MODELS_DIR) -> Optional[str]:
    """Searches models directory for any valid .pt file that can serve as fallback."""
    pt_files = glob.glob(os.path.join(models_dir, "*.pt"))
    for pt in pt_files:
        if os.path.getsize(pt) > 1024 * 1024 * 500:
            return pt
    return None

def download_checkpoint(
    url: str,
    destination_path: str,
    on_progress: Optional[Callable[[float, int, int], None]] = None
) -> str:
    """Downloads checkpoint (~2.8GB) from URL with streaming to a temporary file, then renames it."""
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    temp_path = destination_path + ".tmp"
    logger.info(f"Downloading checkpoint (~2.8GB) from {url} to {temp_path}...")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    try:
        response = requests.get(url, stream=True, timeout=(30, 600), headers=headers)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 2809738232))
        downloaded = 0
        chunk_size = 1024 * 1024 * 8  # 8MB chunks
        last_logged_pct = -1

        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = (downloaded / total_size) * 100
                        int_pct = int(pct)
                        if int_pct != last_logged_pct and int_pct % 10 == 0:
                            last_logged_pct = int_pct
                            logger.info(f"Checkpoint download progress: {pct:.1f}% ({downloaded / (1024*1024):.1f}MB / {total_size / (1024*1024):.1f}MB)")
                            if on_progress:
                                on_progress(pct, downloaded, total_size)

        # Atomically rename
        if os.path.exists(destination_path):
            os.remove(destination_path)
        os.rename(temp_path, destination_path)
        # Update mtime to current time
        os.utime(destination_path, None)
        logger.info(f"Checkpoint successfully downloaded and saved to: {destination_path} ({downloaded / (1024*1024):.1f}MB)")
        return destination_path

    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        logger.error(f"Failed to download checkpoint from {url}: {e}")

        # Fallback 1: If current destination exists
        if os.path.isfile(destination_path) and os.path.getsize(destination_path) > 1024 * 1024 * 100:
            logger.warning(f"Using existing cached checkpoint at {destination_path} as fallback.")
            os.utime(destination_path, None)
            return destination_path

        # Fallback 2: If any other .pt exists in models dir
        alt_pt = find_any_existing_checkpoint(os.path.dirname(destination_path))
        if alt_pt:
            logger.warning(f"Using alternative cached checkpoint at {alt_pt} as fallback.")
            os.utime(alt_pt, None)
            return alt_pt

        raise RuntimeError(f"Checkpoint download failed and no cached model available: {e}")

def get_or_update_checkpoint(
    checkpoint_path: str = config.CHECKPOINT_PATH, 
    url: str = config.DEFAULT_CHECKPOINT_URL, 
    ttl_seconds: int = config.CHECKPOINT_CACHE_TTL_SECONDS,
    on_progress: Optional[Callable[[float, int, int], None]] = None
) -> str:
    """
    Ensures a valid model checkpoint is available for ml-sharp.
    1. If a valid cache exists (< 24 hours old), use it directly without re-downloading.
    2. Once a day, attempt to update.
    3. If update fails or offline, fall back to the existing cached checkpoint.
    """
    if is_checkpoint_valid(checkpoint_path, ttl_seconds):
        return checkpoint_path
    
    return download_checkpoint(url, checkpoint_path, on_progress=on_progress)
