"""OpenLabel OCR service (docTR, CPU or NVIDIA GPU).

Implements the model-backend contract: POST /predict with an image, returns a canonical OCR
page (packages/contracts/src/ocr/canonical.ts). Any other engine can replace this service by
answering the same request. PDFs are read page by page: /pdf/info counts the pages and
/pdf/render turns one page into an image for /predict.
"""

from __future__ import annotations

import io
import os
import time
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from PIL import Image, ImageOps

DET_ARCH = os.environ.get("OCR_DET_ARCH", "db_resnet50")
RECO_ARCH = os.environ.get("OCR_RECO_ARCH", "parseq")
THREADS = int(os.environ.get("OCR_THREADS", "4"))
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "4000"))
# "cuda" uses the GPU when one is visible, else falls back to CPU; "cpu" forces CPU.
DEVICE_PREF = os.environ.get("OCR_DEVICE", "cpu")

import torch  # noqa: E402  (import after env so thread settings apply)
from doctr.models import ocr_predictor, page_orientation_predictor  # noqa: E402

torch.set_num_threads(THREADS)
DEVICE = "cuda" if DEVICE_PREF == "cuda" and torch.cuda.is_available() else "cpu"
PREDICTOR = ocr_predictor(DET_ARCH, RECO_ARCH, pretrained=True, assume_straight_pages=True)
# Page orientation model (0/90/180/270). Photos of slips are often sideways or upside down, and a
# straight-page OCR reads nothing on those.
ORIENT_ARCH = os.environ.get("OCR_ORIENTATION_ARCH", "mobilenet_v3_small_page_orientation")
ORIENT = os.environ.get("OCR_AUTO_ROTATE", "1") == "1"
ORIENTER = page_orientation_predictor(ORIENT_ARCH, pretrained=True) if ORIENT else None
if DEVICE == "cuda":
    half = os.environ.get("OCR_HALF", "1") == "1"
    PREDICTOR = PREDICTOR.cuda().half() if half else PREDICTOR.cuda()
    if ORIENTER is not None:
        ORIENTER = ORIENTER.cuda()
# Engine version names the model, not the hardware: GPU and CPU give the same labels.
ENGINE_VERSION = f"doctr-{DET_ARCH}+{RECO_ARCH}"

app = FastAPI(title="OpenLabel OCR (docTR)")


def _read(image: Image.Image) -> Any:
    with torch.inference_mode():
        return PREDICTOR([np.asarray(image)]).pages[0]


def _mean_conf(page: Any) -> tuple[int, float]:
    confs = [w.confidence for b in page.blocks for l in b.lines for w in l.words if w.value.strip()]
    return len(confs), (sum(confs) / len(confs) if confs else 0.0)


def _orientation(image: Image.Image) -> tuple[int, float]:
    """Orientation model's guess: degrees counter-clockwise to turn upright, and its confidence."""
    with torch.inference_mode():
        _, angles, confs = ORIENTER([np.asarray(image)])  # type: ignore[misc]
    return int(angles[0]) % 360, round(float(confs[0]), 4)


def _upright(image: Image.Image) -> tuple[Image.Image, int, Any, dict[str, Any]]:
    """
    Turns the page upright and reads it, and reports how it decided, so orientation can be
    measured per model like any other prediction.

    The straight read comes first; a confident one needs no turning. Otherwise the orientation
    model guesses the turn. It tells sideways from straight reliably but sometimes not which way
    up, so both candidates (guess and guess+180) are read and the more confident reading wins.
    Returns (upright image, degrees counter-clockwise, docTR page, decision record).
    """
    page = _read(image)
    n, conf = _mean_conf(page)
    record: dict[str, Any] = {
        "model": ORIENT_ARCH if ORIENTER is not None else None,
        "predicted": None,
        "predictedConf": None,
        "applied": 0,
        "method": "straight",
        "candidates": [{"rotation": 0, "words": n, "meanConf": round(conf, 4)}],
    }
    if ORIENTER is None:
        record["method"] = "disabled"
        return image, 0, page, record
    guess, guess_conf = _orientation(image)
    record["predicted"], record["predictedConf"] = guess, guess_conf
    # A confident straight read needs no turning (the common case, and the fastest).
    if guess == 0 and n >= 3 and conf >= 0.8:
        return image, 0, page, record
    best = (image, 0, page, n, conf)
    for deg in sorted({guess, (guess + 180) % 360} - {0}):
        turned = image.rotate(deg, expand=True)
        cand = _read(turned)
        cn, cc = _mean_conf(cand)
        record["candidates"].append({"rotation": deg, "words": cn, "meanConf": round(cc, 4)})
        # Prefer the more confident text; never trade it for a reading that lost most of the words.
        if (cc, cn) > (best[4], best[3]) and cn >= max(3, best[3] // 2):
            best = (turned, deg, cand, cn, cc)
    record["applied"] = best[1]
    record["method"] = "model" if best[1] == guess else "model+confidence"
    return best[0], best[1], best[2], record


def _box(geometry: Any, width: int, height: int) -> list[list[float]]:
    """docTR relative ((x1,y1),(x2,y2)) -> 4-point polygon in pixels of the original image."""
    (x1, y1), (x2, y2) = geometry
    x1, x2 = round(x1 * width, 1), round(x2 * width, 1)
    y1, y2 = round(y1 * height, 1), round(y2 * height, 1)
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


PDF_DPI = int(os.environ.get("OCR_PDF_DPI", "200"))
PDF_MAX_SIDE = int(os.environ.get("OCR_PDF_MAX_SIDE", "3500"))


def _pdf(raw: bytes) -> Any:
    import pypdfium2 as pdfium  # ships with docTR

    try:
        return pdfium.PdfDocument(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=415, detail=f"not a readable PDF: {exc}") from exc


@app.post("/pdf/info")
async def pdf_info(file: UploadFile = File(...)) -> dict[str, Any]:
    """Number of pages and each page's size in points (1/72 inch)."""
    doc = _pdf(await file.read())
    try:
        sizes = [doc.get_page_size(i) for i in range(len(doc))]
        return {"pages": len(doc), "sizes": [{"width": w, "height": h} for w, h in sizes]}
    finally:
        doc.close()


@app.post("/pdf/render")
async def pdf_render(file: UploadFile = File(...), page: int = 1) -> Response:
    """
    One PDF page as a JPEG at OCR_PDF_DPI (longest side capped at OCR_PDF_MAX_SIDE), as it sits
    on the page; /predict then turns it upright like any photo. `page` starts at 1.
    """
    doc = _pdf(await file.read())
    try:
        if page < 1 or page > len(doc):
            raise HTTPException(status_code=404, detail=f"page {page} of {len(doc)}")
        pdf_page = doc[page - 1]
        w, h = pdf_page.get_size()
        scale = min(PDF_DPI / 72, PDF_MAX_SIDE / max(w, h, 1))
        image = pdf_page.render(scale=scale).to_pil().convert("RGB")
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=92)
        return Response(content=out.getvalue(), media_type="image/jpeg")
    finally:
        doc.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "doctr", "version": ENGINE_VERSION, "device": DEVICE}


def _turned(image: Image.Image, deg: int) -> tuple[Image.Image, int, Any, dict[str, Any]]:
    """
    A person said how far the page is turned: read it that way. The model's own guess is still
    recorded so orientation accuracy can be measured against the person's answer.
    """
    record: dict[str, Any] = {
        "model": ORIENT_ARCH if ORIENTER is not None else None,
        "predicted": None,
        "predictedConf": None,
        "applied": deg,
        "method": "manual",
        "candidates": [],
    }
    if ORIENTER is not None:
        record["predicted"], record["predictedConf"] = _orientation(image)
    turned = image.rotate(deg, expand=True) if deg else image
    page = _read(turned)
    n, conf = _mean_conf(page)
    record["candidates"].append({"rotation": deg, "words": n, "meanConf": round(conf, 4)})
    return turned, deg, page, record


@app.post("/predict")
async def predict(
    file: UploadFile = File(...), asset_id: str = "unknown", rotate: int | None = None
) -> dict[str, Any]:
    """`rotate` (degrees counter-clockwise, 0/90/180/270) skips auto-rotation and reads the page that way."""
    raw = await file.read()
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=415, detail=f"not a readable image: {exc}") from exc

    width, height = image.size
    if max(width, height) > MAX_SIDE:
        raise HTTPException(status_code=413, detail=f"image larger than {MAX_SIDE}px on a side")

    started = time.perf_counter()
    if rotate is not None:
        if rotate % 90 != 0:
            raise HTTPException(status_code=422, detail="rotate must be 0, 90, 180 or 270")
        image, rotated, page, orientation = _turned(image, rotate % 360)
    else:
        image, rotated, page, orientation = _upright(image)
    width, height = image.size
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
        # Boxes are in pixels of the page turned upright by this many degrees counter-clockwise;
        # width/height above are of that upright page.
        "rotationApplied": rotated,
        "linesSource": "engine",
        "lines": lines,
        "fields": {},
        "meta": {"latencyMs": latency_ms, "orientation": orientation},
    }
