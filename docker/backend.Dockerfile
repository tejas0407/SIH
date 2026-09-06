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
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
