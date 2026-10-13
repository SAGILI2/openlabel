"""Kaggle background run: rebuild the Hindi data and fine-tune PARSeq on every GPU.

Runs unattended as a committed Kaggle notebook ("Save Version" / save_notebook), so it keeps going
when an interactive session or SSH tunnel drops. Everything it needs is fetched here; progress is
written to /kaggle/working/train.log and the best checkpoint to /kaggle/working/parseq-hindi-v2.pt,
both kept as the run's output.

Sources (all fetched over the internet, nothing is uploaded):
  * IIIT-INDIC-HW-WORDS-Hindi (CC BY 4.0) - handwritten words, via its Hugging Face mirror
  * devanagari-ocr-synthetic-80k (MIT) - only its text, for a news-word vocabulary
  * Google Fonts Devanagari families (OFL) - for rendering printed words

The OpenLabel scripts (prepare_hindi.py, train_parseq.py, words_from_parquet.py) are embedded into
the notebook by build_kaggle_notebook.py, which writes them next to this file before main() runs.
"""

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

WORK = Path("/kaggle/working")
RUN = Path("/tmp/hindi")
EPOCHS = int(os.environ.get("HINDI_EPOCHS", "10"))
SYNTHETIC = int(os.environ.get("HINDI_SYNTHETIC", "300000"))
HF = "https://huggingface.co/api/datasets"
FONTS = [
    "notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf",
    "notoserifdevanagari/NotoSerifDevanagari%5Bwdth%2Cwght%5D.ttf",
    "hind/Hind-Regular.ttf",
    "hind/Hind-Bold.ttf",
    "mukta/Mukta-Regular.ttf",
    "kalam/Kalam-Regular.ttf",
    "yatraone/YatraOne-Regular.ttf",
]


def log(message: str) -> None:
    line = json.dumps({"stage": message}) if not message.startswith("{") else message
    print(line, flush=True)
    with open(WORK / "train.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        urllib.request.urlretrieve(url, dest)


def run(*cmd: str) -> None:
    """Runs a step, streaming its output into train.log so the run page and SSH both show it."""
    with open(WORK / "train.log", "a", encoding="utf-8") as out:
        proc = subprocess.Popen(cmd, cwd=RUN, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line, end="", flush=True)
            if line.startswith("{"):
                out.write(line)
                out.flush()
    if proc.wait() != 0:
        raise SystemExit(f"step failed: {' '.join(cmd[:3])}")


def main() -> None:
    RUN.mkdir(parents=True, exist_ok=True)
    (WORK / "train.log").write_text("", encoding="utf-8")
    log("installing")
    # Kaggle's pip config logs to /var/log/pip.log, which isn't writable; log to /tmp instead.
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "--log", "/tmp/pip.log", "python-doctr==1.1.0"],
        check=True,
    )

    for script in ["prepare_hindi.py", "train_parseq.py", "words_from_parquet.py"]:
        if not (RUN / script).is_file():
            raise SystemExit(f"{script} missing; build the notebook with build_kaggle_notebook.py")

    log("downloading")
    for font in FONTS:
        name = font.split("/")[-1].split("%5B")[0]
        fetch(f"https://raw.githubusercontent.com/google/fonts/main/ofl/{font}", RUN / "fonts" / (name if name.endswith(".ttf") else f"{name}.ttf"))
    for split in ["train/0", "train/1", "train/2", "validation/0", "test/0"]:
        fetch(f"{HF}/c3rl/IIIT-INDIC-HW-WORDS-Hindi/parquet/default/{split}.parquet", RUN / "iiit" / f"{split}.parquet")
    for split in ["train/0", "train/1", "validation/0"]:
        fetch(f"{HF}/iamkushagratomar/devanagari-ocr-synthetic-80k/parquet/default/{split}.parquet", RUN / "lines" / f"{split}.parquet")

    log("building vocabulary")
    with open(RUN / "vocab.txt", "w", encoding="utf-8") as f:
        subprocess.run(
            [sys.executable, "words_from_parquet.py", *map(str, sorted((RUN / "lines").rglob("*.parquet")))],
            cwd=RUN, stdout=f, check=True,
        )

    log("building training data")
    fonts = [arg for f in sorted((RUN / "fonts").glob("*.ttf")) for arg in ("--font", str(f))]
    hf_train = [arg for f in sorted((RUN / "iiit" / "train").glob("*.parquet")) for arg in ("--hf-train", str(f))]
    run(
        sys.executable, "prepare_hindi.py", *hf_train,
        "--hf-validation", str(RUN / "iiit" / "validation" / "0.parquet"),
        "--vocab", str(RUN / "vocab.txt"), "--out", str(RUN / "manifests"),
        "--synthetic", str(SYNTHETIC), *fonts,
    )

    init = next(Path("/kaggle/input").rglob("parseq-hindi.pt"), None) if Path("/kaggle/input").is_dir() else None
    gpus = int(subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True).stdout.count("GPU "))
    log(json.dumps({"stage": "training", "gpus": gpus, "epochs": EPOCHS, "warm_start": str(init) if init else None}))
    launcher = ["torchrun", "--standalone", f"--nproc_per_node={gpus}"] if gpus > 1 else [sys.executable]
    run(
        *launcher, "train_parseq.py",
        "--images", str(RUN / "manifests"),
        "--train", str(RUN / "manifests" / "train.json"),
        "--validation", str(RUN / "manifests" / "validation.json"),
        "--output", str(WORK / "parseq-hindi-v2.pt"),
        "--epochs", str(EPOCHS), "--workers", "2",
        *(["--init", str(init)] if init else []),
    )
    log("TRAIN_DONE")


if __name__ == "__main__":
    main()
