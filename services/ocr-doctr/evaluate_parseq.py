"""Score a recognition checkpoint on held-out word crops, the way the OCR service would read them.

The checkpoint is loaded through app.py's own loader (OCR_RECO_CHECKPOINT) and wrapped in docTR's
recognition predictor, so preprocessing and decoding match production exactly.

    python evaluate_parseq.py --checkpoint models/parseq-hindi.pt --dataset data/Dataset/test/ocr
    python evaluate_parseq.py --dataset data/Dataset/test/ocr            # pretrained docTR baseline
"""

from __future__ import annotations

import argparse
import json
import os
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image


def edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, help="Checkpoint from train_parseq.py; omit for the pretrained baseline")
    parser.add_argument("--dataset", type=Path, required=True, help="Folder of N.jpg + N.txt crops")
    parser.add_argument("--examples", type=int, default=15, help="Wrong readings to print")
    args = parser.parse_args()

    os.environ["OCR_RECO_CHECKPOINT"] = str(args.checkpoint or "")
    os.environ.setdefault("OCR_AUTO_ROTATE", "0")
    import app  # noqa: PLC0415  (reads the environment above at import time)
    from doctr.models import recognition_predictor  # noqa: PLC0415

    model = app.recognizer if not isinstance(app.recognizer, str) else None
    predictor = recognition_predictor(model or app.RECO_ARCH, pretrained=model is None)
    if app.DEVICE == "cuda":
        predictor = predictor.cuda()

    rows = []
    for image in sorted(args.dataset.glob("*.jpg"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
        label = image.with_suffix(".txt")
        if label.is_file():
            text = unicodedata.normalize("NFC", label.read_text(encoding="utf-8").strip())
            if text:
                rows.append((image, text))
    crops = [np.asarray(Image.open(p).convert("RGB")) for p, _ in rows]
    predictions = predictor(crops)

    edits = chars = exact = 0
    wrong = []
    for (path, expected), (predicted, conf) in zip(rows, predictions):
        distance = edit_distance(predicted, expected)
        edits += distance
        chars += len(expected)
        exact += predicted == expected
        if distance and len(wrong) < args.examples:
            wrong.append({"file": path.name, "expected": expected, "read": predicted, "conf": round(float(conf), 3)})
    print(
        json.dumps(
            {
                "model": app.ENGINE_VERSION,
                "crops": len(rows),
                "cer": round(edits / max(chars, 1), 4),
                "word_accuracy": round(exact / max(len(rows), 1), 4),
                "examples": wrong,
            },
            ensure_ascii=False,
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
