import { z } from "zod";

/** Directed relations between regions (architecture section 13.2). */
export const relationTypeSchema = z.enum([
  "overlapped_by",
  "occluded_by",
  "inside",
  "contains",
  "part_of",
  "same_as",
]);

export const relationSchema = z.object({
  type: relationTypeSchema,
  /** Id of the related region in the same annotation. */
  target: z.string().min(1),
});

export type RelationType = z.infer<typeof relationTypeSchema>;
export type Relation = z.infer<typeof relationSchema>;
