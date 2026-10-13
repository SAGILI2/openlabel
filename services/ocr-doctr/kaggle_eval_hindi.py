"""Kaggle background run: score Hindi PARSeq checkpoints on held-out word crops.

Attached inputs (no uploads): the training run's output (parseq-hindi-v2.pt) and the public
"Sanskrit & Hindi OCR" dataset (its test/ocr crops). The official IIIT-INDIC-HW-WORDS-Hindi test
split (CC BY 4.0) is downloaded and unpacked into the same N.jpg + N.txt layout.

Each checkpoint is scored with evaluate_parseq.py, which loads it through app.py exactly as the OCR
service does. Results go to /kaggle/working/eval.json.
"""

import json
import os
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path

RUN = Path("/tmp/hindi-eval")
WORK = Path("/kaggle/working")
IIIT_TEST = "https://huggingface.co/api/datasets/c3rl/IIIT-INDIC-HW-WORDS-Hindi/parquet/default/test/0.parquet"


def unpack_parquet(parquet: Path, out: Path) -> int:
    import pyarrow.parquet as pq  # noqa: PLC0415

    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for batch in pq.ParquetFile(parquet).iter_batches(columns=["image", "text"], batch_size=2000):
        for row in batch.to_pylist():
            text = unicodedata.normalize("NFC", (row["text"] or "").strip())
            if text:
                n += 1
                (out / f"{n}.jpg").write_bytes(row["image"]["bytes"])
                (out / f"{n}.txt").write_text(text, encoding="utf-8")
    return n


def score(checkpoint: Path | None, dataset: Path) -> dict:
    args = [sys.executable, "evaluate_parseq.py", "--dataset", str(dataset), "--examples", "8"]
    if checkpoint:
        args += ["--checkpoint", str(checkpoint)]
    env = {**os.environ, "OCR_DEVICE": "cuda"}
    out = subprocess.run(args, cwd=RUN, env=env, capture_output=True, text=True, check=True).stdout
    return json.loads(out[out.index("{"):])


def main() -> None:
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "--log", "/tmp/pip.log",
         "python-doctr==1.1.0", "fastapi", "python-multipart"],
        check=True,
    )
    inputs = Path("/kaggle/input")
    v2 = next(inputs.rglob("parseq-hindi-v2.pt"))
    kaggle_test = next(p for p in inputs.rglob("ocr") if p.parent.name == "test" and p.is_dir())

    iiit = RUN / "iiit-test"
    urllib.request.urlretrieve(IIIT_TEST, RUN / "iiit-test.parquet")
    crops = unpack_parquet(RUN / "iiit-test.parquet", iiit)
    print(json.dumps({"iiit_test_crops": crops, "v2": str(v2), "kaggle_test": str(kaggle_test)}), flush=True)

    results = {}
    for name, checkpoint, dataset in [
        ("v2_iiit_test", v2, iiit),
        ("v2_kaggle_test", v2, kaggle_test),
        ("baseline_iiit_test", None, iiit),
    ]:
        results[name] = score(checkpoint, dataset)
        r = results[name]
        print(json.dumps({"run": name, "crops": r["crops"], "cer": r["cer"], "word_accuracy": r["word_accuracy"]}), flush=True)
    (WORK / "eval.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"stage": "EVAL_DONE"}), flush=True)


if __name__ == "__main__":
    main()
