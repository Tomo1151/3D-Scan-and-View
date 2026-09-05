#!/usr/bin/env bash
set -e

echo "=================================================="
echo "  3D Scan & View (ml-sharp 3DGS & Off-Axis Viewer)"
echo "=================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed."
    exit 1
fi

VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "[INFO] Creating Python virtual environment at .venv..."
    python3 -m venv "$VENV_DIR"
fi

echo "[INFO] Installing / verifying core dependencies..."
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r backend/requirements.txt

# Check and install apple/ml-sharp
echo "[INFO] Checking apple/ml-sharp installation..."
SHARP_CHECK=$("$VENV_PYTHON" -c "import importlib.util; print(importlib.util.find_spec('sharp') is not None)" 2>/dev/null || echo "False")
if [ "$SHARP_CHECK" != "True" ]; then
    echo "[INFO] Installing apple/ml-sharp from GitHub (git+https://github.com/apple/ml-sharp.git)..."
    "$VENV_PYTHON" -m pip install git+https://github.com/apple/ml-sharp.git || echo "[WARN] Failed to install ml-sharp via git. App will fall back to test mode if unavailable."
else
    echo "[INFO] apple/ml-sharp is already installed."
fi

export PYTHONPATH="$SCRIPT_DIR/backend:$PYTHONPATH"
export DATA_DIR="$SCRIPT_DIR/data"
export MODELS_DIR="$SCRIPT_DIR/models"

# Detect Local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

# SSL Setup
CERTS_DIR="$SCRIPT_DIR/certs"
CERT_FILE="$CERTS_DIR/cert.pem"
KEY_FILE="$CERTS_DIR/key.pem"

echo "[INFO] Checking SSL certificates for secure LAN camera access..."
"$VENV_PYTHON" backend/generate_cert.py

USE_SSL=true
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    USE_SSL=false
fi

echo ""
echo "=================================================="
if [ "$USE_SSL" = true ]; then
    echo "[READY] Server running in HTTPS mode (Camera & Face Tracking enabled on LAN)"
    echo "  - Local access: https://localhost:8000"
    echo "  - LAN access:   https://$LOCAL_IP:8000"
    echo "  (Note: Accept the self-signed certificate warning in your browser once)"
    echo "=================================================="
    "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile "$KEY_FILE" --ssl-certfile "$CERT_FILE" --reload
else
    echo "[READY] Server running in HTTP mode"
    echo "  - Local access: http://localhost:8000"
    echo "  - LAN access:   http://$LOCAL_IP:8000"
    echo "=================================================="
    "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
