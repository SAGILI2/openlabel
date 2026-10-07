import { z } from "zod";

/** A point in pixels of the original asset, origin at the top-left. */
export const pointSchema = z.tuple([z.number(), z.number()]);

/** Axis-aligned box `[x1, y1, x2, y2]` with x1 <= x2 and y1 <= y2. */
export const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([x1, y1, x2, y2]) => x1 <= x2 && y1 <= y2, { message: "bbox must satisfy x1<=x2 and y1<=y2" });

/** Closed polygon with at least 3 vertices; boxes are 4-point polygons. */
export const polygonSchema = z.array(pointSchema).min(3);

/** Confidence in [0, 1]; `null` when the source does not provide one (never invented). */
export const confidenceSchema = z.number().min(0).max(1).nullable();

export type Point = z.infer<typeof pointSchema>;
export type BBox = z.infer<typeof bboxSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
