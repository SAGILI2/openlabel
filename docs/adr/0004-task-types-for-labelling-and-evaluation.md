# ADR-0004: Task types drive both labelling and evaluation

- Status: accepted
- Date: 2026-10-07

## Context

OpenLabel must serve any labelling requirement — document classification, object detection,
segmentation, speech-to-text, NER, LLM preference data — and must evaluate any model for those
tasks, not only OCR. The first design described evaluation only for OCR (CER/WER on words), which
would force every other task to be bolted on later.

## Decision

The unit of extension is a **task type** (e.g. `image.classification`, `image.detection`,
`document.ocr`, `audio.transcription`, `text.ner`, `llm.preference`). Each task type is a plugin
that supplies, in one package:

| Part                | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Annotation schema   | zod schema for its labels (class, boxes, transcript segments, spans …)        |
| Editor              | the UI used to label it (canvas, waveform, text, form)                        |
| Prediction contract | canonical model output — same shape as the annotation plus confidence         |
| Engine adapters     | convert any model or API response into the canonical prediction               |
| Matcher             | pairs predictions with ground truth (Hungarian on IoU, time overlap, spans …) |
| Metrics             | the task's standard metrics with bootstrap confidence intervals               |
| Exporters           | training formats for the task                                                 |

The core — assets, taxonomies, annotation versions, review, snapshots, benchmarks, eval runs,
leaderboard, slices, regression gate — knows nothing task-specific. It stores the canonical
prediction and the metric rows the plugin emits.

Initial metric sets:

| Task type                       | Metrics                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Classification (single / multi) | accuracy, macro/micro precision, recall, F1, confusion matrix, top-k, calibration (ECE) |
| Object detection                | mAP@0.5, mAP@0.5:0.95 (COCO protocol), per-class AP, precision/recall at threshold      |
| Segmentation                    | mean IoU, Dice, boundary F1                                                             |
| OCR                             | CER, WER, detection F1, end-to-end F1, field accuracy (as in architecture §12)          |
| Speech-to-text                  | WER, CER, insertions/deletions/substitutions, per-speaker WER, diarization error rate   |
| NER / spans                     | entity-level precision/recall/F1 (strict and partial match)                             |
| LLM / generative                | reference match, rubric scores, LLM-as-judge with human agreement, win rate             |

All task types share operational metrics (latency p50/p95, cost per 1,000 items, failure rate).

## Consequences

- OCR is the first plugin built, not a special case; classification, detection and
  speech-to-text follow on the same interfaces.
- The evaluation epic (OL-E7) is renamed "Model evaluation" and split into a task-agnostic core
  plus one ticket per task type's matcher and metrics.
- Metric implementations must match the reference definitions (pycocotools for detection,
  jiwer-style normalisation for WER) and be tested against them.
