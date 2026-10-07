import { z } from "zod";
import { imageRegionSchema } from "./region.js";

/** All regions of one image asset plus whole-image tags, with referential checks. */
export const imageAnnotationSchema = z
  .object({
    tags: z.array(z.string().min(1)).default([]),
    regions: z.array(imageRegionSchema),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const r of value.regions) {
      if (ids.has(r.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate region id "${r.id}"`, path: ["regions"] });
      }
      ids.add(r.id);
    }
    for (const r of value.regions) {
      for (const rel of r.relations) {
        if (!ids.has(rel.target)) {
          ctx.addIssue({
            code: "custom",
            message: `region "${r.id}" relates to unknown region "${rel.target}"`,
            path: ["regions"],
          });
        }
      }
    }
  });

export type ImageAnnotation = z.infer<typeof imageAnnotationSchema>;
