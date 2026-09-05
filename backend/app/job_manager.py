import time
import asyncio
from typing import Dict, Optional, Any
from enum import Enum
from pydantic import BaseModel

class JobStatus(str, Enum):
    PENDING = "pending"
    SEGMENTING = "segmenting"
    GENERATING_3DGS = "generating_3dgs"
    CLEANING_PLY = "cleaning_ply"
    COMPLETED = "completed"
    FAILED = "failed"

class JobInfo(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = 0  # 0 to 100
    message: str = ""
    error: Optional[str] = None
    created_at: float
    updated_at: float
    input_image_url: Optional[str] = None
    segmented_image_url: Optional[str] = None
    splat_url: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None

class JobManager:
    def __init__(self):
        self._jobs: Dict[str, JobInfo] = {}
        self._lock = asyncio.Lock()

    async def create_job(self, job_id: str) -> JobInfo:
        async with self._lock:
            now = time.time()
            job = JobInfo(
                job_id=job_id,
                status=JobStatus.PENDING,
                progress=0,
                message="ジョブを受付しました",
                created_at=now,
                updated_at=now,
            )
            self._jobs[job_id] = job
            return job

    async def update_job(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        progress: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        input_image_url: Optional[str] = None,
        segmented_image_url: Optional[str] = None,
        splat_url: Optional[str] = None,
        stats: Optional[Dict[str, Any]] = None,
    ) -> Optional[JobInfo]:
        async with self._lock:
            if job_id not in self._jobs:
                return None
            job = self._jobs[job_id]
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if message is not None:
                job.message = message
            if error is not None:
                job.error = error
            if input_image_url is not None:
                job.input_image_url = input_image_url
            if segmented_image_url is not None:
                job.segmented_image_url = segmented_image_url
            if splat_url is not None:
                job.splat_url = splat_url
            if stats is not None:
                job.stats = stats
            job.updated_at = time.time()
            return job

    async def get_job(self, job_id: str) -> Optional[JobInfo]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def list_jobs(self) -> Dict[str, JobInfo]:
        async with self._lock:
            return dict(self._jobs)

# Global singleton
job_manager = JobManager()
