"""OpenLabel OCR service (docTR, CPU or NVIDIA GPU).

Implements the model-backend contract: POST /predict with an image, returns a canonical OCR
page (packages/contracts/src/ocr/canonical.ts). Any other engine can replace this service by
answering the same request.
"""

from __future__ import annotations

import io
import os
import time
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps

DET_ARCH = os.environ.get("OCR_DET_ARCH", "db_resnet50")
RECO_ARCH = os.environ.get("OCR_RECO_ARCH", "parseq")
THREADS = int(os.environ.get("OCR_THREADS", "4"))
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "4000"))
# "cuda" uses the GPU when one is visible, else falls back to CPU; "cpu" forces CPU.
DEVICE_PREF = os.environ.get("OCR_DEVICE", "cpu")

import torch  # noqa: E402  (import after env so thread settings apply)
from doctr.models import ocr_predictor  # noqa: E402

torch.set_num_threads(THREADS)
DEVICE = "cuda" if DEVICE_PREF == "cuda" and torch.cuda.is_available() else "cpu"
PREDICTOR = ocr_predictor(DET_ARCH, RECO_ARCH, pretrained=True, assume_straight_pages=True)
if DEVICE == "cuda":
    PREDICTOR = PREDICTOR.cuda().half() if os.environ.get("OCR_HALF", "1") == "1" else PREDICTOR.cuda()
# Engine version names the model, not the hardware: GPU and CPU give the same labels.
ENGINE_VERSION = f"doctr-{DET_ARCH}+{RECO_ARCH}"

app = FastAPI(title="OpenLabel OCR (docTR)")


def _box(geometry: Any, width: int, height: int) -> list[list[float]]:
    """docTR relative ((x1,y1),(x2,y2)) -> 4-point polygon in pixels of the original image."""
    (x1, y1), (x2, y2) = geometry
    x1, x2 = round(x1 * width, 1), round(x2 * width, 1)
    y1, y2 = round(y1 * height, 1), round(y2 * height, 1)
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "doctr", "version": ENGINE_VERSION, "device": DEVICE}


@app.post("/predict")
async def predict(file: UploadFile = File(...), asset_id: str = "unknown") -> dict[str, Any]:
    raw = await file.read()
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=415, detail=f"not a readable image: {exc}") from exc

    width, height = image.size
    if max(width, height) > MAX_SIDE:
        raise HTTPException(status_code=413, detail=f"image larger than {MAX_SIDE}px on a side")

    started = time.perf_counter()
    with torch.inference_mode():
        page = PREDICTOR([np.asarray(image)]).pages[0]
    latency_ms = round((time.perf_counter() - started) * 1000)

    lines: list[dict[str, Any]] = []
    for b, block in enumerate(page.blocks):
        for l, line in enumerate(block.lines):
            words = [
                {
                    "id": f"w{b}_{l}_{w}",
                    "text": word.value,
                    "poly": _box(word.geometry, width, height),
                    "conf": round(float(word.confidence), 4),
                }
                for w, word in enumerate(line.words)
                if word.value.strip()
            ]
            if not words:
                continue
            lines.append(
                {
                    "id": f"l{b}_{l}",
                    "text": " ".join(w["text"] for w in words),
                    "poly": _box(line.geometry, width, height),
                    "conf": min(w["conf"] for w in words),
                    "words": words,
                }
            )

    return {
        "engine": "doctr",
        "engineVersion": ENGINE_VERSION,
        "assetId": asset_id,
        "page": 1,
        "width": width,
        "height": height,
        "unit": "px",
        "rotationApplied": 0,
        "linesSource": "engine",
        "lines": lines,
        "fields": {},
        "meta": {"latencyMs": latency_ms},
    }
