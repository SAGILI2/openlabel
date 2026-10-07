import { z } from "zod";
import { confidenceSchema } from "../../geometry/index.js";
import { defineTaskType } from "../define.js";

/** A stretch of audio in seconds with its transcript. */
const segmentSchema = z
  .object({
    id: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    text: z.string(),
    speaker: z.string().min(1).optional(),
    /** BCP 47 language tag, e.g. `en`, `te-IN`. */
    lang: z.string().min(2).optional(),
  })
  .refine((s) => s.end > s.start, { message: "segment end must be after start", path: ["end"] });

export const transcriptionAnnotationSchema = z.object({ segments: z.array(segmentSchema) });

export const transcriptionPredictionSchema = z.object({
  segments: z.array(
    z
      .object({
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        text: z.string(),
        speaker: z.string().min(1).optional(),
        conf: confidenceSchema,
      })
      .refine((s) => s.end > s.start, { message: "segment end must be after start", path: ["end"] }),
  ),
});

/** Speech-to-text with optional speaker turns. */
export const audioTranscription = defineTaskType({
  id: "audio.transcription",
  modality: "audio",
  title: "Speech transcription",
  description: "Mark speech segments on the waveform, type what was said and who said it.",
  regionKind: "segment",
  annotation: transcriptionAnnotationSchema,
  prediction: transcriptionPredictionSchema,
  metrics: [
    {
      key: "wer",
      label: "Word error rate",
      goal: "lower",
      unit: "ratio",
      description: "Word edits needed per true word.",
    },
    {
      key: "cer",
      label: "Character error rate",
      goal: "lower",
      unit: "ratio",
      description: "Character edits needed per true character.",
    },
    {
      key: "der",
      label: "Diarization error rate",
      goal: "lower",
      unit: "ratio",
      description: "Share of time with the wrong or a missing speaker.",
    },
  ],
  exportFormats: ["jsonl-manifest", "hf-datasets"],
  examples: {
    annotation: { segments: [{ id: "s1", start: 0, end: 2.4, text: "hello there", speaker: "A" }] },
    prediction: { segments: [{ start: 0.1, end: 2.3, text: "hello there", conf: 0.81 }] },
  },
});
