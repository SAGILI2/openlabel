import { z } from "zod";

/** Flags that can be set on a text region (architecture section 13.1). */
export const textFlagSchema = z.enum([
  "occluded",
  "partially-visible",
  "illegible",
  "handwritten",
  "strikethrough",
  "low-contrast",
  "vertical-text",
  "sensitive",
]);

export type TextFlag = z.infer<typeof textFlagSchema>;
