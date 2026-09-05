import logging
import torch

logger = logging.getLogger(__name__)

def get_optimal_device() -> str:
    """
    Selects the optimal execution device available in the environment.
    Priority: CUDA (NVIDIA) > MPS (Apple Silicon Metal) > CPU (Fallback).
    """
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        logger.info(f"Using CUDA device: {gpu_name}")
        return "cuda"
    
    # Check for Apple Silicon MPS
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        if torch.backends.mps.is_built():
            logger.info("Using Apple Silicon MPS (Metal Performance Shaders)")
            return "mps"
    
    logger.info("Falling back to CPU device")
    return "cpu"

def get_device_info() -> dict:
    """Returns diagnostic information about available devices."""
    cuda_avail = torch.cuda.is_available()
    mps_avail = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    
    info = {
        "selected_device": get_optimal_device(),
        "cuda_available": cuda_avail,
        "cuda_device_name": torch.cuda.get_device_name(0) if cuda_avail else None,
        "cuda_count": torch.cuda.device_count() if cuda_avail else 0,
        "mps_available": mps_avail,
        "torch_version": torch.__version__,
    }
    return info
