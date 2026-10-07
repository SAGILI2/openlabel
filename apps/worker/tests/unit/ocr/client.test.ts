import { describe, expect, it } from "vitest";
import type { CanonicalOcrPage } from "@openlabel/contracts";
import { minConfidence } from "../../../src/ocr/client.js";

const poly: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
];

function page(confs: (number | null)[]): CanonicalOcrPage {
  return {
    engine: "t",
    engineVersion: "1",
    assetId: "a",
    page: 1,
    width: 10,
    height: 10,
    unit: "px",
    rotationApplied: 0,
    linesSource: "engine",
    fields: {},
    meta: {},
    lines: [
      {
        id: "l",
        text: "",
        poly,
        conf: null,
        words: confs.map((conf, i) => ({ id: `w${String(i)}`, text: "x", poly, conf })),
      },
    ],
  };
}

describe("minConfidence", () => {
  it("returns the lowest word confidence, ignoring nulls", () => {
    expect(minConfidence(page([0.9, null, 0.42, 0.7]))).toBe(0.42);
  });

  it("is null when no word reports a confidence", () => {
    expect(minConfidence(page([null, null]))).toBeNull();
    expect(minConfidence(page([]))).toBeNull();
  });
});
