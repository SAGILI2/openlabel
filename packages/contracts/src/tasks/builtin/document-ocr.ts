import { canonicalOcrPageSchema } from "../../ocr/index.js";
import { imageAnnotationSchema } from "../../regions/index.js";
import { defineTaskType } from "../define.js";

const square = [
  [10, 10],
  [90, 10],
  [90, 30],
  [10, 30],
] as [number, number][];

/** Words and lines with text on a page; the existing region and canonical OCR contracts. */
export const documentOcr = defineTaskType({
  id: "document.ocr",
  modality: "document",
  title: "Text recognition (OCR)",
  description: "Correct word and line boxes and their text on scanned or photographed pages.",
  regionKind: "polygon",
  annotation: imageAnnotationSchema,
  prediction: canonicalOcrPageSchema,
  metrics: [
    {
      key: "cer",
      label: "Character error rate",
      goal: "lower",
      unit: "ratio",
      description: "Edits needed per true character.",
    },
    {
      key: "wer",
      label: "Word error rate",
      goal: "lower",
      unit: "ratio",
      description: "Edits needed per true word.",
    },
    {
      key: "detection_f1",
      label: "Detection F1",
      goal: "higher",
      unit: "ratio",
      description: "Word boxes found, at IoU 0.5.",
    },
    {
      key: "e2e_f1",
      label: "End-to-end F1",
      goal: "higher",
      unit: "ratio",
      description: "Words with both the right box and the right text.",
    },
  ],
  exportFormats: ["doctr-recognition", "doctr-detection", "coco", "jsonl"],
  examples: {
    annotation: { regions: [{ id: "w1", kind: "text", label: "word", poly: square, text: "Total" }] },
    prediction: {
      engine: "example",
      engineVersion: "1",
      assetId: "a1",
      width: 100,
      height: 40,
      lines: [
        {
          id: "l1",
          text: "Total",
          poly: square,
          conf: 0.9,
          words: [{ id: "w1", text: "Total", poly: square, conf: 0.9 }],
        },
      ],
    },
  },
});
