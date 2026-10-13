# Hindi PARSeq fine-tuning

The OCR service uses docTR with DB ResNet-50 detection and PARSeq recognition. The default
recognizer remains the pretrained docTR model. A Hindi/Devanagari checkpoint can be enabled by
setting `OCR_RECO_CHECKPOINT` to a checkpoint produced by `train_parseq.py`.

## Dataset format

Prepare cropped words or text lines and two JSON manifests. Each manifest maps a path relative to
`--images` to its exact transcription:

```json
{
  "train/000001.png": "यह एक परीक्षण है",
  "train/000002.png": "कुल राशि ₹१२३४"
}
```

Use a separate validation manifest. Keep it free of duplicate pages or crops from the training
set. Include Hindi, Devanagari matras/conjuncts, digits, punctuation, and the Hindi-English mix
found in the target documents. Review licensing and provenance before combining datasets.

## Train

The training script uses the pinned docTR 1.1.0 PARSeq implementation. It transfers the visual
transformer from docTR's pretrained checkpoint, initializes the vocabulary-dependent embedding and
output head for the supplied characters, and saves the best validation-loss checkpoint:

```bash
python services/ocr-doctr/train_parseq.py \
  --images /data/hindi-crops \
  --train /data/hindi-crops/train.json \
  --validation /data/hindi-crops/validation.json \
  --output /models/parseq-hindi.pt \
  --epochs 20 \
  --batch-size 64 \
  --max-length 64
```

Training requires the same Python dependencies as the OCR image. Use a GPU image or a separate
training environment; do not add a large training dataset to this repository.

The script prints JSON metrics per epoch and rejects manifests without Devanagari characters,
transcriptions longer than `--max-length`, missing images, or an empty manifest.

## Serve the checkpoint

Mount the checkpoint read-only into the OCR container and set:

```text
OCR_RECO_CHECKPOINT=/models/parseq-hindi.pt
```

The service validates `vocab`, `max_length`, and the model state dictionary before starting. Its
`POST /predict` response remains the existing canonical OpenLabel OCR contract, so the worker,
editor, orientation handling, and database do not change.

Do not set `OCR_RECO_CHECKPOINT` until the checkpoint has been evaluated on a held-out set from the
real document domain. Record character error rate and word error rate for Hindi-only,
mixed-script, numeric-heavy, and low-quality scans separately.
