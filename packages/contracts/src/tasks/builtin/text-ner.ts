import { z } from "zod";
import { confidenceSchema } from "../../geometry/index.js";
import { defineTaskType } from "../define.js";

/** Character offsets into the source text, end exclusive. */
const spanSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    label: z.string().min(1),
  })
  .refine((s) => s.end > s.start, { message: "span end must be after start", path: ["end"] });

export const nerAnnotationSchema = z.object({ spans: z.array(spanSchema) });

export const nerPredictionSchema = z.object({
  spans: z.array(
    z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        label: z.string().min(1),
        conf: confidenceSchema,
      })
      .refine((s) => s.end > s.start, { message: "span end must be after start", path: ["end"] }),
  ),
});

/** Named entities as labelled spans of text. */
export const textNer = defineTaskType({
  id: "text.ner",
  modality: "text",
  title: "Named entities",
  description: "Highlight names, amounts, dates and other entities in text.",
  regionKind: "span",
  annotation: nerAnnotationSchema,
  prediction: nerPredictionSchema,
  metrics: [
    {
      key: "f1_strict",
      label: "F1 (exact match)",
      goal: "higher",
      unit: "ratio",
      description: "Entities with the exact span and label.",
    },
    {
      key: "f1_partial",
      label: "F1 (overlap)",
      goal: "higher",
      unit: "ratio",
      description: "Entities with an overlapping span and the right label.",
    },
  ],
  exportFormats: ["conll", "spacy", "jsonl"],
  examples: {
    annotation: { spans: [{ id: "e1", start: 0, end: 5, label: "ORG" }] },
    prediction: { spans: [{ start: 0, end: 5, label: "ORG", conf: 0.97 }] },
  },
});
