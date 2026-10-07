import { z } from "zod";
import { confidenceSchema, polygonSchema } from "../geometry/index.js";

/**
 * Canonical OCR result (architecture section 12.1).
 *
 * Every OCR engine adapter converts its native response into this shape so results from
 * different engines can be compared with the same matcher and metrics. Coordinates are
 * always pixels of the original asset page; confidences are always 0–1 or `null`.
 */
export const canonicalWordSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  poly: polygonSchema,
  conf: confidenceSchema,
});

export const canonicalLineSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  poly: polygonSchema,
  conf: confidenceSchema,
  words: z.array(canonicalWordSchema),
});

export const canonicalFieldSchema = z.object({
  value: z.string(),
  conf: confidenceSchema,
  wordIds: z.array(z.string()).default([]),
});

export const canonicalOcrPageSchema = z.object({
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  assetId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  unit: z.literal("px").default("px"),
  /** Degrees the engine rotated the page; boxes are already mapped back to the original. */
  rotationApplied: z.number().default(0),
  /** `engine` when the engine produced lines; `derived` when the platform grouped words into lines. */
  linesSource: z.enum(["engine", "derived"]).default("engine"),
  lines: z.array(canonicalLineSchema),
  fields: z.record(z.string(), canonicalFieldSchema).default({}),
  meta: z
    .object({
      latencyMs: z.number().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional(),
      rawRef: z.string().optional(),
      error: z.string().optional(),
    })
    .default({}),
});

export type CanonicalWord = z.infer<typeof canonicalWordSchema>;
export type CanonicalLine = z.infer<typeof canonicalLineSchema>;
export type CanonicalField = z.infer<typeof canonicalFieldSchema>;
export type CanonicalOcrPage = z.infer<typeof canonicalOcrPageSchema>;
