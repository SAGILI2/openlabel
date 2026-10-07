import { describe, expect, it } from "vitest";
import { canonicalOcrPageSchema } from "../../../src/ocr/canonical.js";

const poly = [
  [0, 0],
  [10, 0],
  [10, 5],
  [0, 5],
];

describe("canonicalOcrPageSchema", () => {
  it("accepts a minimal page and applies defaults", () => {
    const page = canonicalOcrPageSchema.parse({
      engine: "tesseract",
      engineVersion: "5.4.0",
      assetId: "a1",
      width: 100,
      height: 50,
      lines: [
        {
          id: "l1",
          text: "Invoice",
          poly,
          conf: 0.9,
          words: [{ id: "w1", text: "Invoice", poly, conf: null }],
        },
      ],
    });
    expect(page.page).toBe(1);
    expect(page.unit).toBe("px");
    expect(page.linesSource).toBe("engine");
    expect(page.lines[0]?.words[0]?.conf).toBeNull();
  });

  it("rejects confidences outside 0-1", () => {
    const bad = {
      engine: "x",
      engineVersion: "1",
      assetId: "a",
      width: 1,
      height: 1,
      lines: [{ id: "l", text: "t", poly, conf: 87, words: [] }],
    };
    expect(canonicalOcrPageSchema.safeParse(bad).success).toBe(false);
  });
});
