# GradFiT ML Serving Container — SageMaker BYOC
#
# A single GPU container that hosts the entire generative pipeline:
# SAM2 segmentation, ControlNet (canny + depth), FLUX.1-dev with the
# clothing LoRA + IP-Adapter, and Real-ESRGAN x4 upscaling.
#
# The container speaks the SageMaker hosting protocol (POST /invocations,
# GET /ping) on port 8080 via gunicorn + a Flask handler.

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/ml/model/hf_cache \
    TORCH_HOME=/opt/ml/model/torch_cache \
    TRANSFORMERS_OFFLINE=0 \
    SAGEMAKER_PROGRAM=inference.py \
    SAGEMAKER_BIND_TO_PORT=8080

# OS deps. libgl/libglib are pulled by opencv-python; ffmpeg keeps the
# door open for the future video studio without rebuilding the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3-pip python3.11-venv \
        git wget curl ca-certificates \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
        ffmpeg \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && python -m pip install --upgrade pip setuptools wheel \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/program

# Install Python deps first to keep layer cache hot when source changes.
COPY requirements.txt /opt/program/requirements.txt
RUN pip install --extra-index-url https://download.pytorch.org/whl/cu124 \
        torch==2.5.1 torchvision==0.20.1 \
    && pip install -r /opt/program/requirements.txt

# Source. Models are NOT baked into the image; they are warmed at startup
# from S3 (or from the HuggingFace hub if S3 cache is empty) so we can
# update LoRAs without rebuilding the container.
COPY src/ /opt/program/src/
COPY scripts/ /opt/program/scripts/
COPY serve /opt/program/serve

ENV PYTHONPATH=/opt/program/src
ENV PATH=/opt/program:${PATH}

RUN chmod +x /opt/program/serve

EXPOSE 8080

# SageMaker invokes `serve` as the entrypoint. `serve` boots gunicorn
# pointing at src/inference.py:app.
ENTRYPOINT ["/opt/program/serve"]
