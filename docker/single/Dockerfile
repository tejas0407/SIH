# Single-container build of the whole stack, for hosts that run one container
# behind one port (see deploy/oracle/). The whole docker-compose stack — PostGIS, Redis, MinIO, the FastAPI backend, the Celery
# worker and the Next.js console — runs here under supervisord, with nginx on
# port 7860 as the only thing the outside world talks to:
#
#   /                        -> Next.js        127.0.0.1:3000
#   /api/, /health           -> FastAPI        127.0.0.1:8000
#   /raw-scans/ etc.         -> MinIO          127.0.0.1:9000  (presigned scan URLs)
#
# Build locally from the repo root to test:
#   docker build -f docker/single/Dockerfile -t bhu-validate .
#   docker run --rm -p 7860:7860 -e PUBLIC_HOST=localhost:7860 -e LOCAL_HTTP=1 bhu-validate

# ---------- frontend build ----------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
# Same-origin API: nginx routes /api/ to the backend, so the browser never
# needs to know a second host.
ENV NEXT_PUBLIC_API_BASE=/api/v1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-hin \
        tesseract-ocr-mar \
        tesseract-ocr-eng \
        fonts-lohit-deva \
        fonts-dejavu-core \
        libgl1 \
        libglib2.0-0 \
        libpq-dev \
        curl \
        postgresql-15 \
        postgresql-15-postgis-3 \
        redis-server \
        nginx \
        supervisor \
    && rm -rf /var/lib/apt/lists/*

# Same MinIO release docker-compose.yml pins. dl.min.io no longer serves
# release binaries, so take it from the official image instead.
COPY --from=minio/minio:RELEASE.2024-09-22T00-33-43Z /usr/bin/minio /usr/local/bin/minio

# Node runtime for the Next.js standalone server.
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY backend/requirements.txt .
# CPU-only torch first, for the same reason as docker/backend.Dockerfile.
RUN pip install --upgrade pip \
    && pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt \
    # PaddleOCR pulls in opencv-python and opencv-contrib-python transitively,
    # duplicating the pinned opencv-python-headless. All three install into the
    # same cv2/ package, so uninstalling the duplicates deletes the headless
    # build's files too; reinstall it afterwards or `import cv2` is left empty.
    && (pip uninstall -y opencv-python opencv-contrib-python || true) \
    && pip install --no-deps --force-reinstall opencv-python-headless==4.10.0.84 \
    && python -c "import cv2; cv2.imread"

# Everything runs as an unprivileged user (uid 1000), so everything written at
# runtime has to belong to that user.
RUN useradd -m -u 1000 user \
    # Pre-create the data dir so a Docker volume mounted here inherits uid 1000.
    && mkdir -p /home/user/data && chown user:user /home/user/data

COPY --chown=user backend/ /app/
COPY --from=frontend --chown=user /app/.next/standalone /frontend/
COPY --from=frontend --chown=user /app/.next/static /frontend/.next/static
COPY --from=frontend --chown=user /app/public /frontend/public
COPY --chown=user docker/single/nginx.conf docker/single/supervisord.conf docker/single/start.sh docker/single/bootstrap.sh /opt/app/
RUN chmod +x /opt/app/start.sh /opt/app/bootstrap.sh

USER user
ENV HOME=/home/user \
    PATH=/usr/lib/postgresql/15/bin:$PATH \
    DATA_DIR=/home/user/data \
    APP_ENV=production \
    POSTGRES_USER=dilrmp \
    POSTGRES_PASSWORD=dilrmp_single_password \
    POSTGRES_DB=land_records \
    POSTGRES_HOST=127.0.0.1 \
    POSTGRES_PORT=5432 \
    REDIS_URL=redis://127.0.0.1:6379/0 \
    CELERY_BROKER_URL=redis://127.0.0.1:6379/1 \
    CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/2 \
    MINIO_ENDPOINT=127.0.0.1:9000 \
    MINIO_ROOT_USER=minioadmin \
    MINIO_ROOT_PASSWORD=minioadmin \
    MINIO_SECURE=false \
    MINIO_PUBLIC_SECURE=true \
    OFFLINE_MODE=true

EXPOSE 7860
CMD ["/opt/app/start.sh"]
