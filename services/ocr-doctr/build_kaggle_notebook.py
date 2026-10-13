"""Builds a self-contained Kaggle notebook (.ipynb) that runs Hindi PARSeq training unattended.

The training scripts are embedded as %%writefile cells, so the notebook needs nothing from this
repository at run time. Push it as a private Kaggle notebook and "Save Version" (or save_notebook
with SaveAndRunAll) to run it in the background on Kaggle's GPUs.

    python build_kaggle_notebook.py hindi-parseq.ipynb --epochs 10
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).parent
EMBEDDED = ["prepare_hindi.py", "train_parseq.py", "words_from_parquet.py", "kaggle_train_hindi.py"]


def code(source: str) -> dict:
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": source}


def script(epochs: int, synthetic: int) -> str:
    """One self-contained Python script (Kaggle "script" kernel) that writes the helpers, then runs."""
    lines = [
        "# OpenLabel: Hindi PARSeq fine-tuning, Kaggle background run. Progress: /kaggle/working/train.log",
        "import os, runpy",
        "os.makedirs('/tmp/hindi', exist_ok=True)",
        "FILES = {",
    ]
    for name in EMBEDDED:
        lines.append(f"    {name!r}: {(HERE / name).read_text(encoding='utf-8')!r},")
    lines += [
        "}",
        "for name, text in FILES.items():",
        "    with open(f'/tmp/hindi/{name}', 'w', encoding='utf-8') as f:",
        "        f.write(text)",
        f"os.environ['HINDI_EPOCHS'] = '{epochs}'",
        f"os.environ['HINDI_SYNTHETIC'] = '{synthetic}'",
        "runpy.run_path('/tmp/hindi/kaggle_train_hindi.py', run_name='__main__')",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help=".ipynb for a notebook, .py for a single script")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--synthetic", type=int, default=300_000)
    args = parser.parse_args()
    if args.output.suffix == ".py":
        args.output.write_text(script(args.epochs, args.synthetic), encoding="utf-8")
        print(f"wrote {args.output}")
        return

    cells = [
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": "# OpenLabel: Hindi PARSeq fine-tuning\n\nBackground run. Progress: `/kaggle/working/train.log`.",
        },
        code("import os\nos.makedirs('/tmp/hindi', exist_ok=True)"),
    ]
    for name in EMBEDDED:
        cells.append(code(f"%%writefile /tmp/hindi/{name}\n" + (HERE / name).read_text(encoding="utf-8")))
    cells.append(
        code(
            "import os, runpy\n"
            f"os.environ['HINDI_EPOCHS'] = '{args.epochs}'\n"
            f"os.environ['HINDI_SYNTHETIC'] = '{args.synthetic}'\n"
            "runpy.run_path('/tmp/hindi/kaggle_train_hindi.py', run_name='__main__')"
        )
    )
    notebook = {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    args.output.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {args.output} ({len(cells)} cells)")


if __name__ == "__main__":
    main()
