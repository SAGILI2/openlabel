import { describe, expect, it } from "vitest";
import { snapToInk, type Ink } from "@/features/labelling/snap";

/** White page with dark rectangles ("words") drawn on it. */
function page(width: number, height: number, inkBoxes: [number, number, number, number][]): Ink {
  const gray = new Uint8Array(width * height).fill(235);
  for (const [x, y, w, h] of inkBoxes) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) gray[yy * width + xx] = 30;
  }
  return { width, height, gray };
}

describe("snapToInk", () => {
  it("shrinks a loose box to the word inside it, plus a small margin", () => {
    const ink = page(300, 200, [[100, 80, 60, 20]]);
    expect(snapToInk(ink, { x: 70, y: 60, width: 130, height: 60 })).toEqual({
      x: 98,
      y: 78,
      width: 64,
      height: 24,
    });
  });

  it("ignores slivers of the lines above and below", () => {
    const ink = page(300, 200, [
      [100, 50, 60, 20], // line above, mostly outside the box
      [100, 85, 60, 20], // the word
      [100, 120, 60, 20], // line below
    ]);
    const s = snapToInk(ink, { x: 80, y: 66, width: 100, height: 58 });
    expect(s).toEqual({ x: 98, y: 83, width: 64, height: 24 });
  });

  it("returns null when there is no text, so the drawn box is kept", () => {
    expect(snapToInk(page(200, 100, []), { x: 10, y: 10, width: 80, height: 40 })).toBeNull();
    expect(snapToInk(page(200, 100, []), { x: 10, y: 10, width: 2, height: 2 })).toBeNull();
  });
});
