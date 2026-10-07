# OpenLabel OCR service: docTR on CPU behind the /predict contract.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    DOCTR_CACHE_DIR=/models HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.8.0 torchvision==0.23.0 \
    && pip install -r requirements.txt

# Bake the model weights into the image so the service starts offline.
COPY app.py .
RUN python -c "import app" && useradd --uid 10001 --create-home ocr && chown -R ocr /models
USER ocr

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s CMD curl -fsS http://localhost:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
