import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR.parent
DATA_DIR = os.environ.get("DATA_DIR", str(BASE_DIR / "data"))
MODELS_DIR = os.environ.get("MODELS_DIR", str(BASE_DIR / "models"))
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
OUTPUTS_DIR = os.path.join(DATA_DIR, "outputs")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Checkpoint Settings
CHECKPOINT_FILENAME = "sharp_2572gikvuh.pt"
CHECKPOINT_PATH = os.path.join(MODELS_DIR, CHECKPOINT_FILENAME)
# Official Apple ml-sharp default checkpoint URL
DEFAULT_CHECKPOINT_URL = os.environ.get(
    "CHECKPOINT_URL",
    "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
)
# Cache expiration in seconds (24 hours = 86400s)
CHECKPOINT_CACHE_TTL_SECONDS = int(os.environ.get("CHECKPOINT_CACHE_TTL_SECONDS", 86400))

# PLY Cleaner Parameters (based on validated logic)
BLACK_THRESH = float(os.environ.get("BLACK_THRESH", 0.015))
OUTLIER_K = int(os.environ.get("OUTLIER_K", 20))
OUTLIER_STD_RATIO = float(os.environ.get("OUTLIER_STD_RATIO", 2.0))

# Server Settings
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", 8000))
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "*",
]
