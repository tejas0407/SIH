FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

# System packages:
#  - poppler-utils      rasterises multi-page PDFs at 300 DPI (pdf2image)
#  - tesseract + hin/mar/eng  the offline OCR fallback when Paddle weights
#                       are unavailable, so a demo never dies on a model download
#  - fonts-lohit-deva / fonts-indica  Devanagari glyphs, needed to render the
#                       synthetic demo scans; without them Hindi and Marathi
#                       text draws as empty boxes
#  - libgl1 / libglib   OpenCV runtime
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
# torch is pinned in requirements.txt but installed here first from PyTorch's
# CPU-only wheel index: the default PyPI wheel bundles the full NVIDIA CUDA
# toolkit (~3.4 GB of nvidia-* packages + triton), none of which this pipeline
# ever uses — every OCR call runs with use_gpu=False and nothing here calls
# .cuda(). Installing the CPU build first means `pip install -r
# requirements.txt` sees the pinned version already satisfied and skips it.
RUN pip install --upgrade pip \
    && pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements.txt \
    # PaddleOCR pulls in opencv-python and opencv-contrib-python transitively,
    # duplicating the opencv-python-headless already pinned above; drop the
    # GUI-linked duplicates and keep only the headless build.
    && pip uninstall -y opencv-python opencv-contrib-python 2>/dev/null || true

COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
