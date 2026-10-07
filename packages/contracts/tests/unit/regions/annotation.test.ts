import { describe, expect, it } from "vitest";
import { imageAnnotationSchema } from "../../../src/regions/annotation.js";

const box = [
  [10, 10],
  [50, 10],
  [50, 30],
  [10, 30],
];

describe("imageAnnotationSchema", () => {
  it("accepts text and non-text regions with a relation", () => {
    const parsed = imageAnnotationSchema.parse({
      tags: ["photo", "glare"],
      regions: [
        {
          id: "w1",
          kind: "text",
          label: "word",
          poly: box,
          text: "1,250.00",
          flags: ["occluded"],
          relations: [{ type: "overlapped_by", target: "s1" }],
        },
        { id: "s1", kind: "non-text", label: "stamp", poly: box, layer: "overlay" },
      ],
    });
    expect(parsed.regions[0]?.layer).toBe("document");
    expect(parsed.regions[1]?.ignore).toBe(false);
  });

  it("rejects duplicate region ids", () => {
    const r = { id: "w1", kind: "text", label: "word", poly: box, text: "a" };
    expect(imageAnnotationSchema.safeParse({ regions: [r, r] }).success).toBe(false);
  });

  it("rejects relations to unknown regions", () => {
    const r = {
      id: "w1",
      kind: "text",
      label: "word",
      poly: box,
      text: "a",
      relations: [{ type: "inside", target: "missing" }],
    };
    expect(imageAnnotationSchema.safeParse({ regions: [r] }).success).toBe(false);
  });

  it("rejects polygons with fewer than 3 points", () => {
    const r = {
      id: "w1",
      kind: "text",
      label: "word",
      poly: [
        [0, 0],
        [1, 1],
      ],
      text: "a",
    };
    expect(imageAnnotationSchema.safeParse({ regions: [r] }).success).toBe(false);
  });

  it("rejects unknown flags", () => {
    const r = { id: "w1", kind: "text", label: "word", poly: box, text: "a", flags: ["sparkly"] };
    expect(imageAnnotationSchema.safeParse({ regions: [r] }).success).toBe(false);
  });
});
