# syntax=docker/dockerfile:1
FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

# Install system packages
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy requirements and install
COPY backend/requirements.txt /workspace/backend/requirements.txt
RUN pip install --no-cache-dir -r /workspace/backend/requirements.txt

# Install apple/ml-sharp from official GitHub repository
RUN pip install --no-cache-dir git+https://github.com/apple/ml-sharp.git || true

# Copy project files
COPY backend /workspace/backend
COPY frontend /workspace/frontend

ENV PYTHONPATH=/workspace/backend
ENV DATA_DIR=/workspace/data
ENV MODELS_DIR=/workspace/models

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
