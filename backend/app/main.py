import os
import uuid
import asyncio
import logging
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.job_manager import job_manager, JobStatus
from app.pipeline import run_pipeline
from app.device_utils import get_device_info
from app.checkpoint_manager import is_checkpoint_valid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("3d-scan-and-view")

app = FastAPI(
    title="3D Scan and View API",
    description="apple/ml-sharp 3DGS pipeline with Off-Axis Projection viewer",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Returns runtime environment diagnostics and cache status."""
    device_info = get_device_info()
    cached = is_checkpoint_valid(config.CHECKPOINT_PATH)
    return {
        "status": "ok",
        "device": device_info,
        "checkpoint_cached": cached,
        "checkpoint_path": config.CHECKPOINT_PATH,
    }

@app.post("/api/scan")
async def create_scan_job(
    image: UploadFile = File(...),
    rotation_deg: float = Form(0.0)
):
    """
    Accepts an uploaded image of an object and starts asynchronous 3DGS generation.
    Returns immediately with job_id and pending status.
    """
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    job_id = str(uuid.uuid4())
    upload_ext = Path(image.filename).suffix.lower() or ".png"
    input_image_path = os.path.join(config.UPLOADS_DIR, f"{job_id}{upload_ext}")

    # Save uploaded file
    with open(input_image_path, "wb") as f:
        content = await image.read()
        f.write(content)
    
    # Initialize job in manager
    job = await job_manager.create_job(job_id)
    logger.info(f"Created scan job {job_id} for {image.filename} ({len(content)} bytes)")

    # Launch asynchronous pipeline task in background
    asyncio.create_task(run_pipeline(job_id, input_image_path, rotation_deg))

    return {
        "job_id": job_id,
        "status": job.status,
        "message": job.message,
        "progress": job.progress,
        "status_url": f"/api/jobs/{job_id}/status"
    }

@app.get("/api/jobs/{job_id}/status")
async def get_job_status(job_id: str):
    """Returns the current processing status and progress percentage of a scan job."""
    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job.model_dump()

@app.get("/api/jobs/{job_id}/model.ply")
async def get_cleaned_ply(job_id: str):
    """Serves the generated and cleaned 3DGS PLY file."""
    job_dir = os.path.join(config.OUTPUTS_DIR, job_id)
    ply_path = os.path.join(job_dir, "model_cleaned.ply")
    if not os.path.isfile(ply_path):
        raise HTTPException(status_code=404, detail="Model file not found or not ready yet.")
    return FileResponse(
        path=ply_path,
        media_type="application/octet-stream",
        filename=f"3dgs_{job_id}.ply"
    )

@app.get("/api/jobs/{job_id}/segmented.png")
async def get_segmented_image(job_id: str):
    """Serves the background-removed PNG image."""
    job_dir = os.path.join(config.OUTPUTS_DIR, job_id)
    img_path = os.path.join(job_dir, "segmented.png")
    if not os.path.isfile(img_path):
        raise HTTPException(status_code=404, detail="Segmented image not found.")
    return FileResponse(path=img_path, media_type="image/png")

@app.get("/api/jobs/{job_id}/input.png")
async def get_input_image(job_id: str):
    """Serves the original uploaded image."""
    candidates = glob_matching(os.path.join(config.UPLOADS_DIR, f"{job_id}.*"))
    if not candidates:
        raise HTTPException(status_code=404, detail="Input image not found.")
    return FileResponse(path=candidates[0])

def glob_matching(pattern):
    import glob
    return glob.glob(pattern)

# Mount frontend static files if present
frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
