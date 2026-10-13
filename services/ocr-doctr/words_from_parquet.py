"""Collect Devanagari words from the text column of Hugging Face parquet files, most frequent first.

    python words_from_parquet.py lines/*/*.parquet > vocab/news_words.txt
"""

from __future__ import annotations

import sys
import unicodedata
from collections import Counter

import pyarrow.parquet as pq

PUNCTUATION = ".,:;!?\"'()[]{}|।॥-—–‘’“”"


def main() -> None:
    counts: Counter[str] = Counter()
    for file in sys.argv[1:]:
        for text in pq.read_table(file, columns=["text"]).column("text").to_pylist():
            for word in unicodedata.normalize("NFC", text or "").split():
                word = word.strip(PUNCTUATION)
                if word and len(word) <= 30 and any("ऀ" <= c <= "ॿ" for c in word):
                    counts[word] += 1
    sys.stdout.reconfigure(encoding="utf-8")
    for word, count in counts.most_common():
        print(word, count)


if __name__ == "__main__":
    main()
