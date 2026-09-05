# Windows PowerShell local launcher with HTTPS / LAN camera support
param (
    [switch]$HttpOnly = $false
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  3D Scan & View (ml-sharp 3DGS & Off-Axis Viewer)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Check Python availability
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not found in PATH. Please install Python 3.10+." -ForegroundColor Red
    Exit 1
}

# Setup Virtual Environment
$VenvDir = Join-Path $ScriptDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[INFO] Creating virtual environment at .venv..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

Write-Host "[INFO] Installing / verifying core dependencies..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r backend/requirements.txt

# Install apple/ml-sharp directly from official GitHub
Write-Host "[INFO] Checking apple/ml-sharp installation..." -ForegroundColor Yellow
$SharpInstalled = & $VenvPython -c "import importlib.util; print(importlib.util.find_spec('sharp') is not None)" 2>$null
if ($SharpInstalled -ne "True") {
    Write-Host "[INFO] Installing apple/ml-sharp from GitHub (git+https://github.com/apple/ml-sharp.git)..." -ForegroundColor Yellow
    try {
        & $VenvPython -m pip install git+https://github.com/apple/ml-sharp.git
    } catch {
        Write-Host "[WARN] Failed to install ml-sharp via git. App will fall back to test 3DGS mode if unavailable." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "[INFO] apple/ml-sharp is already installed." -ForegroundColor Green
}

# Environment variables
$env:PYTHONPATH = "$ScriptDir\backend;" + $env:PYTHONPATH
$env:DATA_DIR = "$ScriptDir\data"
$env:MODELS_DIR = "$ScriptDir\models"

# Detect Local IP address for LAN testing
$LocalIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias * | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $LocalIP) { $LocalIP = "localhost" }

# SSL Certificate Setup (Required for Camera/Microphone on LAN devices like smartphones)
$CertsDir = Join-Path $ScriptDir "certs"
$CertFile = Join-Path $CertsDir "cert.pem"
$KeyFile = Join-Path $CertsDir "key.pem"

$UseSSL = -not $HttpOnly
if ($UseSSL) {
    Write-Host "[INFO] Checking SSL certificates for secure LAN camera access..." -ForegroundColor Yellow
    & $VenvPython backend/generate_cert.py
    if (-not (Test-Path $CertFile) -or -not (Test-Path $KeyFile)) {
        Write-Host "[WARN] SSL certificates not generated. Falling back to standard HTTP." -ForegroundColor DarkYellow
        $UseSSL = $false
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
if ($UseSSL) {
    Write-Host "[READY] Server running in HTTPS mode (Camera & Face Tracking enabled on LAN)" -ForegroundColor Green
    Write-Host "  - Local access: https://localhost:8000" -ForegroundColor Cyan
    Write-Host "  - LAN access:   https://$($LocalIP):8000" -ForegroundColor Cyan
    Write-Host "  (Note: Accept the self-signed certificate warning in your browser once)" -ForegroundColor DarkGray
} else {
    Write-Host "[READY] Server running in HTTP mode" -ForegroundColor Yellow
    Write-Host "  - Local access: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  - LAN access:   http://$($LocalIP):8000" -ForegroundColor Cyan
    Write-Host "  (Warning: Mobile browsers block camera on non-localhost HTTP)" -ForegroundColor DarkYellow
}
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

if ($UseSSL) {
    & $VenvPython -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile $KeyFile --ssl-certfile $CertFile --reload
} else {
    & $VenvPython -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
}
