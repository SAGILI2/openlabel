import { z } from "zod";
import { bboxSchema, confidenceSchema } from "../../geometry/index.js";
import { defineTaskType } from "../define.js";

const objectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** `[x1, y1, x2, y2]` in pixels of the original image. */
  bbox: bboxSchema,
  /** Excluded from training and scoring (crowds, heavy occlusion). */
  ignore: z.boolean().default(false),
});

export const detectionAnnotationSchema = z.object({ objects: z.array(objectSchema) });

export const detectionPredictionSchema = z.object({
  objects: z.array(objectSchema.omit({ ignore: true }).extend({ conf: confidenceSchema })),
});

/** Boxes with classes on images, scored with the COCO protocol. */
export const imageDetection = defineTaskType({
  id: "image.detection",
  modality: "image",
  title: "Object detection",
  description: "Draw a box around each object and give it a class.",
  regionKind: "box",
  annotation: detectionAnnotationSchema,
  prediction: detectionPredictionSchema,
  metrics: [
    {
      key: "map50_95",
      label: "mAP@0.5:0.95",
      goal: "higher",
      unit: "ratio",
      description: "COCO mean average precision over IoU 0.5 to 0.95.",
    },
    {
      key: "map50",
      label: "mAP@0.5",
      goal: "higher",
      unit: "ratio",
      description: "Mean average precision at IoU 0.5.",
    },
    {
      key: "recall",
      label: "Recall",
      goal: "higher",
      unit: "ratio",
      description: "True objects found at the chosen confidence threshold.",
    },
  ],
  exportFormats: ["coco", "yolo", "pascal-voc"],
  examples: {
    annotation: { objects: [{ id: "o1", label: "logo", bbox: [10, 10, 60, 40] }] },
    prediction: { objects: [{ id: "p1", label: "logo", bbox: [12, 11, 58, 41], conf: 0.88 }] },
  },
});
