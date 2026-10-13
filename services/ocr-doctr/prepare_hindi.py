"""Build Hindi/Devanagari recognition manifests for train_parseq.py.

Two sources are combined:

* A folder dataset laid out as <split>/ocr/N.jpg + N.txt (e.g. the Kaggle "Sanskrit & Hindi OCR"
  dataset). Pass its root with --dataset; files are referenced in place, not copied.
* Synthetic printed lines rendered from a word list with Devanagari fonts, so the model also sees
  printed text, digits and the Hindi-English mix found in documents.

Writes <out>/train.json and <out>/validation.json mapping paths (relative to <out>) to text, plus
<out>/synthetic/*.png for the rendered lines.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Common words and fragments seen on Indian documents. Extended by the dataset's own labels.
SEED_WORDS = [
    "नाम", "पता", "दिनांक", "राशि", "कुल", "बैंक", "खाता", "संख्या", "शाखा", "जमा", "निकासी",
    "रुपये", "हस्ताक्षर", "ग्राहक", "पिता", "माता", "जन्म", "तिथि", "मोबाइल", "पिन", "कोड",
    "राज्य", "जिला", "गाँव", "शहर", "भुगतान", "रसीद", "चालान", "विवरण", "शेष", "ब्याज", "किस्त",
    "प्रमाणपत्र", "आधार", "पैन", "कार्ड", "सरकार", "भारत", "विभाग", "कार्यालय", "आवेदन", "पत्र",
    "क्रमांक", "दस्तावेज़", "सत्यापित", "स्वीकृत", "अस्वीकृत", "कृपया", "धन्यवाद", "श्री", "श्रीमती",
    "क्षेत्र", "त्रुटि", "ज्ञान", "प्रबंधक", "स्थान", "समय", "वर्ष", "महीना", "दिन", "और", "का", "की",
    "के", "में", "से", "को", "पर", "है", "हैं", "था", "थे", "एक", "दो", "तीन", "चार", "पाँच",
]
LATIN = ["Bank", "A/C", "IFSC", "Rs.", "No.", "Date", "Total", "UPI", "NEFT", "RTGS", "KYC", "PAN"]
DEVANAGARI_DIGITS = "०१२३४५६७८९"


def number(rng: random.Random) -> str:
    value = str(rng.randint(1, 9_999_999))
    if rng.random() < 0.4:
        value = "".join(DEVANAGARI_DIGITS[int(d)] for d in value)
    if rng.random() < 0.3:
        value = "₹" + value
    return value


def phrase(rng: random.Random, words: list[str]) -> str:
    """One word, as docTR's detector crops it: mostly Hindi, some numbers and English tokens."""
    roll = rng.random()
    return number(rng) if roll < 0.12 else rng.choice(LATIN) if roll < 0.2 else rng.choice(words)


def find_fonts(extra: list[Path]) -> list[Path]:
    candidates = list(extra)
    for root in ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")]:
        candidates += Path(root).rglob("*.ttf") if Path(root).is_dir() else []
    keep = [p for p in candidates if any(k in p.name.lower() for k in ("devanagari", "lohit", "mukta", "hind", "kalam", "mangal"))]
    return sorted(set(keep))


def render(text: str, font: ImageFont.FreeTypeFont, rng: random.Random) -> Image.Image:
    left, top, right, bottom = font.getbbox(text)
    pad = rng.randint(4, 12)
    width, height = right - left + 2 * pad, bottom - top + 2 * pad
    shade = rng.randint(200, 255)
    image = Image.new("RGB", (max(width, 8), max(height, 8)), (shade, shade, shade - rng.randint(0, 20)))
    ink = rng.randint(0, 70)
    ImageDraw.Draw(image).text((pad - left, pad - top), text, font=font, fill=(ink, ink, ink + rng.randint(0, 40)))
    if rng.random() < 0.3:
        image = image.rotate(rng.uniform(-2, 2), expand=True, fillcolor=(shade, shade, shade))
    if rng.random() < 0.4:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.0)))
    if rng.random() < 0.3:
        small = image.resize((max(image.width // 2, 8), max(image.height // 2, 8)))
        image = small.resize(image.size)
    return image


def render_chunk(
    job: tuple[Path, list[str], list[Path], int, int, int, float],
) -> list[tuple[str, str, bool]]:
    """Renders lines start..end-1 into <out>/synthetic; returns (path, text, is_validation) rows."""
    out, words, fonts, seed, start, end, validation_fraction = job
    rng = random.Random(seed)
    cache: dict[tuple[Path, int], ImageFont.FreeTypeFont] = {}
    rows = []
    for i in range(start, end):
        text = phrase(rng, words)
        key = (rng.choice(fonts), rng.randint(22, 44))
        font = cache.get(key) or cache.setdefault(key, ImageFont.truetype(str(key[0]), key[1]))
        name = f"synthetic/{i:07d}.png"
        render(text, font, rng).save(out / name)
        rows.append((name, text, rng.random() < validation_fraction))
    return rows


def load_dataset(root: Path, out: Path, split: str) -> dict[str, str]:
    """Rows of one split, linked under <out>/dataset so manifest paths stay inside <out>."""
    rows: dict[str, str] = {}
    folder = root / split / "ocr"
    if not folder.is_dir():
        return rows
    link = out / "dataset" / split
    link.parent.mkdir(exist_ok=True)
    if not link.exists():
        link.symlink_to(folder.resolve(), target_is_directory=True)
    for image in folder.glob("*.jpg"):
        label = image.with_suffix(".txt")
        if not label.is_file():
            continue
        text = unicodedata.normalize("NFC", label.read_text(encoding="utf-8").strip())
        if text:
            rows[f"dataset/{split}/{image.name}"] = text
    return rows


def load_parquet(files: list[Path], out: Path, name: str) -> dict[str, str]:
    """Hugging Face image datasets (columns image{bytes} + text): images written once under <out>/<name>."""
    import pyarrow.parquet as pq  # noqa: PLC0415  (only needed for parquet sources)

    rows: dict[str, str] = {}
    folder = out / name
    folder.mkdir(parents=True, exist_ok=True)
    index = 0
    for file in files:
        for batch in pq.ParquetFile(file).iter_batches(columns=["image", "text"], batch_size=2000):
            for row in batch.to_pylist():
                text = unicodedata.normalize("NFC", (row["text"] or "").strip())
                if text:
                    path = folder / f"{index:07d}.jpg"
                    if not path.exists():
                        path.write_bytes(row["image"]["bytes"])
                    rows[f"{name}/{path.name}"] = text
                index += 1
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, help="Root of a <split>/ocr/N.jpg+N.txt dataset")
    parser.add_argument("--hf-train", type=Path, action="append", default=[], help="Parquet file added to training")
    parser.add_argument("--hf-validation", type=Path, action="append", default=[], help="Parquet file added to validation")
    parser.add_argument("--vocab", type=Path, help="Word list (one word, optionally a count, per line) for synthetic text")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--synthetic", type=int, default=50_000, help="Synthetic lines to render")
    parser.add_argument("--font", type=Path, action="append", default=[], help="Extra .ttf font")
    parser.add_argument("--validation-fraction", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--workers", type=int, default=os.cpu_count() or 1, help="Rendering processes")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    train: dict[str, str] = {}
    validation: dict[str, str] = {}
    if args.dataset:
        train.update(load_dataset(args.dataset, args.out, "train"))
        validation.update(load_dataset(args.dataset, args.out, "val"))
        print(json.dumps({"dataset_train": len(train), "dataset_validation": len(validation)}), flush=True)
    if args.hf_train or args.hf_validation:
        hf_train = load_parquet(args.hf_train, args.out, "hf-train")
        hf_validation = load_parquet(args.hf_validation, args.out, "hf-validation")
        train.update(hf_train)
        validation.update(hf_validation)
        print(json.dumps({"hf_train": len(hf_train), "hf_validation": len(hf_validation)}), flush=True)

    extra = []
    if args.vocab:
        for line in args.vocab.read_text(encoding="utf-8").splitlines():
            word = unicodedata.normalize("NFC", line.split()[0]) if line.strip() else ""
            if any("ऀ" <= c <= "ॿ" for c in word):
                extra.append(word)
    words = sorted({w for text in [*train.values(), *SEED_WORDS, *extra] for w in text.split() if w})
    print(json.dumps({"synthetic_vocabulary": len(words)}), flush=True)
    fonts = find_fonts(args.font)
    if args.synthetic and not fonts:
        raise SystemExit("no Devanagari fonts found; install fonts-noto-core / fonts-lohit-deva or pass --font")
    synthetic_dir = args.out / "synthetic"
    synthetic_dir.mkdir(exist_ok=True)
    # Rendering is CPU-bound: split it into chunks with their own seeds and run them on every core.
    chunks = [
        (args.out, words, fonts, args.seed + start, start, min(start + 2000, args.synthetic), args.validation_fraction)
        for start in range(0, args.synthetic, 2000)
    ]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for rendered in pool.map(render_chunk, chunks):
            for name, text, is_validation in rendered:
                (validation if is_validation else train)[name] = text

    (args.out / "train.json").write_text(json.dumps(train, ensure_ascii=False), encoding="utf-8")
    (args.out / "validation.json").write_text(json.dumps(validation, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"train": len(train), "validation": len(validation), "fonts": len(fonts)}), flush=True)


if __name__ == "__main__":
    main()
