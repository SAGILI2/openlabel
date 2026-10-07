import { describe, expect, it } from "vitest";
import { fractionToPixels, toUnitConfidence, unrotatePoint } from "../../../src/ocr/normalise.js";

describe("toUnitConfidence", () => {
  it("scales 0-100 to 0-1", () => {
    expect(toUnitConfidence(87, 100)).toBeCloseTo(0.87);
  });
  it("keeps 0-1 values", () => {
    expect(toUnitConfidence(0.5, 1)).toBe(0.5);
  });
  it("clamps out-of-range values", () => {
    expect(toUnitConfidence(130, 100)).toBe(1);
  });
  it("never invents a value", () => {
    expect(toUnitConfidence(undefined, 1)).toBeNull();
    expect(toUnitConfidence(Number.NaN, 100)).toBeNull();
  });
});

describe("fractionToPixels", () => {
  it("scales by page size", () => {
    expect(fractionToPixels([[0.5, 0.25]], 200, 400)).toEqual([[100, 100]]);
  });
});

describe("unrotatePoint", () => {
  const w = 100;
  const h = 50;
  it("is identity at 0 degrees", () => {
    expect(unrotatePoint([3, 4], 0, w, h)).toEqual([3, 4]);
  });
  it("maps a point from a 90-degree clockwise rotated page back", () => {
    // rotating a page 90° clockwise maps original (x, y) to (h - y, x)
    const rotated: [number, number] = [h - 4, 3];
    expect(unrotatePoint(rotated, 90, w, h)).toEqual([3, 4]);
  });
  it("handles 180 degrees", () => {
    expect(unrotatePoint([10, 20], 180, w, h)).toEqual([90, 30]);
  });
  it("snaps near-quadrant angles", () => {
    expect(unrotatePoint([3, 4], 359, w, h)).toEqual([3, 4]);
  });
});
