import { z } from "zod";
import { confidenceSchema, polygonSchema } from "../geometry/index.js";
import { textFlagSchema } from "./flags.js";
import { relationSchema } from "./relations.js";
import { valueTypeSchema } from "../value-types/index.js";

/** Drawing order: an `overlay` region (e.g. a stamp) sits above `document` regions it covers. */
export const layerSchema = z.enum(["background", "document", "overlay"]);

const regionBase = z.object({
  id: z.string().min(1),
  /** Taxonomy label key, e.g. `word`, `logo`, `stamp`. Validated against the project taxonomy. */
  label: z.string().min(1),
  poly: polygonSchema,
  layer: layerSchema.default("document"),
  relations: z.array(relationSchema).default([]),
  /** Typed attributes defined by the label in the taxonomy. */
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Excluded from training and from evaluation scoring ("don't care"). */
  ignore: z.boolean().default(false),
});

/** A word or line of text. */
export const textRegionSchema = regionBase.extend({
  kind: z.literal("text"),
  text: z.string(),
  lineId: z.string().optional(),
  flags: z.array(textFlagSchema).default([]),
  conf: confidenceSchema.optional(),
  /** Overrides the label's value type for this region (e.g. one field that must be a date). */
  valueType: valueTypeSchema.optional(),
});

/** A non-text area: logo, stamp, signature, QR code, occluder, other document, table. */
export const nonTextRegionSchema = regionBase.extend({
  kind: z.literal("non-text"),
});

export const imageRegionSchema = z.discriminatedUnion("kind", [textRegionSchema, nonTextRegionSchema]);

export type Layer = z.infer<typeof layerSchema>;
export type TextRegion = z.infer<typeof textRegionSchema>;
export type NonTextRegion = z.infer<typeof nonTextRegionSchema>;
export type ImageRegion = z.infer<typeof imageRegionSchema>;
