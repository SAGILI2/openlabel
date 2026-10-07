import { z } from "zod";
import { confidenceSchema } from "../../geometry/index.js";
import { defineTaskType, type Modality } from "../define.js";

/** Classes assigned to the whole asset. Single-label tasks hold exactly one. */
export const classificationAnnotationSchema = z.object({
  labels: z.array(z.string().min(1)).min(1),
});

/** A score per class, highest first is not required; scoring sorts. */
export const classificationPredictionSchema = z.object({
  scores: z.array(z.object({ label: z.string().min(1), conf: confidenceSchema })).min(1),
});

const metrics = [
  {
    key: "accuracy",
    label: "Accuracy",
    goal: "higher",
    unit: "ratio",
    description: "Assets whose predicted class matches.",
  },
  {
    key: "macro_f1",
    label: "Macro F1",
    goal: "higher",
    unit: "ratio",
    description: "F1 averaged over classes, so rare classes count equally.",
  },
  {
    key: "top5_accuracy",
    label: "Top-5 accuracy",
    goal: "higher",
    unit: "ratio",
    description: "True class among the five highest scores.",
  },
  {
    key: "ece",
    label: "Calibration error",
    goal: "lower",
    unit: "ratio",
    description: "Gap between confidence and actual accuracy.",
  },
] as const;

function classification(modality: Modality, title: string, description: string, exportFormats: string[]) {
  return defineTaskType({
    id: `${modality}.classification`,
    modality,
    title,
    description,
    regionKind: "none",
    annotation: classificationAnnotationSchema,
    prediction: classificationPredictionSchema,
    metrics,
    exportFormats,
    examples: {
      annotation: { labels: ["invoice"] },
      prediction: {
        scores: [
          { label: "invoice", conf: 0.92 },
          { label: "receipt", conf: 0.08 },
        ],
      },
    },
  });
}

export const imageClassification = classification(
  "image",
  "Image classification",
  "Pick one or more classes for each image.",
  ["imagefolder", "csv", "hf-datasets"],
);

export const documentClassification = classification(
  "document",
  "Document classification",
  "Sort each document into a type, such as invoice, receipt or contract.",
  ["csv", "jsonl", "hf-datasets"],
);

export const audioClassification = classification(
  "audio",
  "Audio classification",
  "Tag each clip with sound events, language or speaker traits.",
  ["csv", "hf-datasets"],
);

export const textClassification = classification(
  "text",
  "Text classification",
  "Assign intent, sentiment or topic to each text.",
  ["jsonl", "csv", "hf-datasets"],
);
