"""Fine-tune docTR PARSeq for Hindi/Devanagari recognition.

The input manifests are JSON objects mapping image paths (relative to --images) to text:

    {"train/0001.png": "यह", "synthetic/0000001.png": "राशि"}

Images should be cropped words, like the ones docTR's detector hands the recognizer. Keep
validation images in a separate manifest. The output checkpoint holds the vocabulary and settings
app.py needs to serve it (OCR_RECO_CHECKPOINT).

Runs on one GPU with `python train_parseq.py ...`, or on every GPU of the machine with
`torchrun --nproc_per_node=<gpus> train_parseq.py ...` (--batch-size is per GPU).
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

import torch
import torch.distributed as dist
from PIL import Image
from torch import nn
from torch.nn.parallel import DistributedDataParallel
from torch.utils.data import DataLoader, Dataset, DistributedSampler
from torchvision.transforms import functional as TF
from torchvision.transforms import ColorJitter, GaussianBlur, RandomApply, RandomRotation

from doctr.models import parseq

INPUT_SHAPE = (3, 32, 128)
MEAN = (0.694, 0.695, 0.693)
STD = (0.299, 0.296, 0.301)


def to_input(image: Image.Image) -> torch.Tensor:
    """Same resizing as docTR's recognition predictor: keep the aspect ratio, pad bottom-right with black."""
    height, width = INPUT_SHAPE[1:]
    scale = min(height / image.height, width / image.width)
    size = (max(1, round(image.height * scale)), max(1, round(image.width * scale)))
    tensor = TF.resize(TF.pil_to_tensor(image).float().div(255), list(size), antialias=True)
    padded = torch.zeros(3, height, width)
    padded[:, : size[0], : size[1]] = tensor
    return TF.normalize(padded, MEAN, STD)


class RecognitionManifest(Dataset[tuple[torch.Tensor, str]]):
    """Path-to-transcription manifest; drops transcriptions longer than the model can emit."""

    def __init__(self, images: Path, manifest: Path, max_length: int, augment: bool):
        raw = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"{manifest} must contain a JSON object mapping image paths to text")
        self.images = images
        rows = [(str(path), unicodedata.normalize("NFC", text).strip()) for path, text in raw.items()]
        self.rows = [(p, t) for p, t in rows if t and len(t) <= max_length]
        self.dropped = len(rows) - len(self.rows)
        if not self.rows:
            raise ValueError(f"{manifest} has no usable rows")
        self.augment = (
            [
                RandomApply([RandomRotation(3, expand=True, fill=255)], p=0.3),
                RandomApply([ColorJitter(0.3, 0.3, 0.2)], p=0.5),
                RandomApply([GaussianBlur(3, (0.1, 1.0))], p=0.2),
            ]
            if augment
            else []
        )

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, str]:
        relative, text = self.rows[index]
        with Image.open(self.images / relative) as image:
            image = image.convert("RGB")
        for step in self.augment:
            image = step(image)
        return to_input(image), text


def collate(batch: list[tuple[torch.Tensor, str]]) -> tuple[torch.Tensor, list[str]]:
    images, texts = zip(*batch)
    return torch.stack(list(images)), list(texts)


def vocabulary(*sets: RecognitionManifest) -> str:
    # The base vocab keeps English, digits and punctuation readable; the manifests add Devanagari.
    chars = set(parseq(pretrained=False).vocab) | {c for s in sets for _, t in s.rows for c in t}
    # PARSeq uses vocabulary order as class indices; sorting makes checkpoints reproducible.
    return "".join(sorted(chars))


def pretrained_parseq(vocab: str, max_length: int) -> nn.Module:
    """PARSeq started from docTR's pretrained weights, resized for `vocab` and `max_length`.

    The visual transformer and decoder load as-is. Characters docTR already knows keep their
    embedding and output rows, so English stays readable while Hindi is learned; new characters
    start fresh. Position queries are copied for the positions both models have.
    """
    base = parseq(pretrained=True)
    model = parseq(pretrained=False, vocab=vocab, max_length=max_length)
    skip = {"pos_queries", "embed.embedding.weight", "head.weight", "head.bias"}
    model.load_state_dict({k: v for k, v in base.state_dict().items() if k not in skip}, strict=False)
    old = {c: i for i, c in enumerate(base.vocab)}
    with torch.no_grad():
        shared = min(base.pos_queries.shape[1], model.pos_queries.shape[1])
        model.pos_queries[:, :shared] = base.pos_queries[:, :shared]
        pairs = [(i, old[c]) for i, c in enumerate(vocab) if c in old]
        # Special tokens follow the characters: EOS (head + embedding), then SOS and PAD (embedding).
        head_pairs = pairs + [(len(vocab), len(base.vocab))]
        embed_pairs = head_pairs + [(len(vocab) + k, len(base.vocab) + k) for k in (1, 2)]
        for new, prev in head_pairs:
            model.head.weight[new] = base.head.weight[prev]
            model.head.bias[new] = base.head.bias[prev]
        for new, prev in embed_pairs:
            model.embed.embedding.weight[new] = base.embed.embedding.weight[prev]
    return model


def edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device, amp: bool) -> dict[str, float]:
    """Loss plus character error rate and exact-word accuracy, overall and per source folder."""
    model.eval()
    loss_total, batches = 0.0, 0
    stats: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])  # edits, chars, exact, words
    rows = iter(loader.dataset.rows)  # type: ignore[attr-defined]
    with torch.inference_mode(), torch.autocast(device.type, enabled=amp):
        for images, texts in loader:
            result = model(images.to(device), target=texts, return_preds=True)
            loss_total += float(result["loss"].item())
            batches += 1
            for (predicted, _), expected in zip(result["preds"], texts):
                source = next(rows)[0].split("/", 1)[0]
                for key in ("all", source):
                    s = stats[key]
                    s[0] += edit_distance(predicted, expected)
                    s[1] += len(expected)
                    s[2] += predicted == expected
                    s[3] += 1
    out = {"validation_loss": loss_total / max(batches, 1)}
    for key, (edits, chars, exact, words) in stats.items():
        out[f"cer_{key}"] = round(edits / max(chars, 1), 4)
        out[f"word_acc_{key}"] = round(exact / max(words, 1), 4)
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, required=True, help="Root directory containing recognition crops")
    parser.add_argument("--train", type=Path, required=True, help="Training JSON manifest")
    parser.add_argument("--validation", type=Path, required=True, help="Validation JSON manifest")
    parser.add_argument("--output", type=Path, required=True, help="Output .pt checkpoint")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--max-length", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--no-amp", action="store_true", help="Train in float32 (default: mixed precision on GPU)")
    parser.add_argument("--init", type=Path, help="Start from an earlier checkpoint of this trainer instead of docTR's")
    return parser.parse_args()


def warm_start(model: nn.Module, vocab: str, checkpoint: Path) -> None:
    """Copies an earlier checkpoint in; rows of characters both vocabularies share are mapped across."""
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    old_vocab: str = state["vocab"]
    weights = state["state_dict"]
    skip = {"pos_queries", "embed.embedding.weight", "head.weight", "head.bias"}
    model.load_state_dict({k: v for k, v in weights.items() if k not in skip}, strict=False)
    old = {c: i for i, c in enumerate(old_vocab)}
    with torch.no_grad():
        shared = min(weights["pos_queries"].shape[1], model.pos_queries.shape[1])
        model.pos_queries[:, :shared] = weights["pos_queries"][:, :shared]
        pairs = [(i, old[c]) for i, c in enumerate(vocab) if c in old] + [(len(vocab), len(old_vocab))]
        for new, prev in pairs:
            model.head.weight[new] = weights["head.weight"][prev]
            model.head.bias[new] = weights["head.bias"][prev]
        for new, prev in pairs + [(len(vocab) + k, len(old_vocab) + k) for k in (1, 2)]:
            model.embed.embedding.weight[new] = weights["embed.embedding.weight"][prev]


def main() -> None:
    args = parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.max_length < 1:
        raise ValueError("epochs, batch-size, and max-length must be positive")
    # torchrun sets WORLD_SIZE/LOCAL_RANK: one process per GPU, gradients averaged across them.
    distributed = int(os.environ.get("WORLD_SIZE", "1")) > 1
    rank = 0
    if distributed:
        dist.init_process_group("nccl")
        rank = dist.get_rank()
        local_rank = int(os.environ["LOCAL_RANK"])
        torch.cuda.set_device(local_rank)
        device = torch.device("cuda", local_rank)
    else:
        device = torch.device(args.device)
    main_process = rank == 0
    random.seed(args.seed + rank)
    torch.manual_seed(args.seed)
    amp = device.type == "cuda" and not args.no_amp

    train_set = RecognitionManifest(args.images, args.train, args.max_length, augment=True)
    validation_set = RecognitionManifest(args.images, args.validation, args.max_length, augment=False)
    vocab = vocabulary(train_set, validation_set)
    if not any("ऀ" <= char <= "ॿ" for char in vocab):
        raise ValueError("manifests contain no Devanagari characters")
    if main_process:
        print(
            json.dumps(
                {
                    "train": len(train_set),
                    "validation": len(validation_set),
                    "dropped_too_long": train_set.dropped + validation_set.dropped,
                    "vocab_size": len(vocab),
                    "device": str(device),
                    "gpus": dist.get_world_size() if distributed else 1,
                    "amp": amp,
                }
            ),
            flush=True,
        )

    model = pretrained_parseq(vocab, args.max_length)
    if args.init:
        warm_start(model, vocab, args.init)
    model = model.to(device)
    # Validation runs on the plain model in the main process; training goes through DDP.
    trained: nn.Module = DistributedDataParallel(model, device_ids=[device.index]) if distributed else model
    sampler = DistributedSampler(train_set, shuffle=True, seed=args.seed) if distributed else None
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        num_workers=args.workers,
        collate_fn=collate,
        pin_memory=device.type == "cuda",
        drop_last=True,
        persistent_workers=args.workers > 0,
    )
    validation_loader = DataLoader(
        validation_set,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        collate_fn=collate,
        pin_memory=device.type == "cuda",
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=args.learning_rate, total_steps=args.epochs * len(train_loader), pct_start=0.1
    )
    scaler = torch.amp.GradScaler(device.type, enabled=amp)

    best = float("inf")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        if sampler is not None:
            sampler.set_epoch(epoch)
        trained.train()
        started, running, batches = time.time(), 0.0, 0
        for images, texts in train_loader:
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device.type, enabled=amp):
                loss = trained(images.to(device, non_blocking=True), target=texts)["loss"]
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            running += float(loss.item())
            batches += 1
        if not main_process:
            dist.barrier()  # wait while the main process validates and saves
            continue
        metrics = evaluate(model, validation_loader, device, amp)
        print(
            json.dumps(
                {
                    "epoch": epoch,
                    "train_loss": round(running / max(batches, 1), 4),
                    "minutes": round((time.time() - started) / 60, 1),
                    **metrics,
                }
            ),
            flush=True,
        )
        if metrics["validation_loss"] < best:
            best = metrics["validation_loss"]
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "vocab": vocab,
                    "max_length": args.max_length,
                    "input_shape": INPUT_SHAPE,
                    "mean": MEAN,
                    "std": STD,
                    "engine": "doctr-parseq-hindi",
                    "epoch": epoch,
                    "metrics": metrics,
                },
                args.output,
            )
        if distributed:
            dist.barrier()
    if distributed:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
