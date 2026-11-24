# AI-Based Voice Biomarker Tool: production image (CPU).
# Models (~1.9 GB) are NOT baked in. The "models" service in docker-compose.yml downloads them
# once into a named volume, and the app mounts that volume read-only.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    HF_HOME=/app/models/.hf_cache \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    APP_ENV=production

WORKDIR /app

# Dependencies first (cached layer). CPU-only PyTorch wheels.
COPY requirements-server.txt .
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-server.txt

# Application code
COPY backend/ backend/
COPY frontend/ frontend/
COPY scripts/download_model.py scripts/download_model.py

# Non-root user; models volume mount point owned by it (Docker copies this ownership into a new volume)
RUN useradd --system --uid 10001 --no-create-home app \
 && mkdir -p /app/models \
 && chown app:app /app/models
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import json,urllib.request,sys; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=4)); sys.exit(0 if d.get('model_loaded') else 1)"

# One worker: the models are large and analyses run one at a time (see backend/app.py).
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header", "--timeout-keep-alive", "15"]
