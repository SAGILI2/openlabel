import { describe, expect, it } from "vitest";
import {
  annotationFromWords,
  boxToPoly,
  normaliseBox,
  polyToBox,
  wordsFromAnnotation,
  wordsFromPrediction,
} from "@/features/labelling/regions";

const page = {
  engine: "doctr",
  engineVersion: "1",
  assetId: "a",
  width: 200,
  height: 100,
  lines: [
    {
      id: "l1",
      text: "Total 1O5",
      poly: [
        [10, 10],
        [90, 10],
        [90, 30],
        [10, 30],
      ],
      conf: 0.6,
      words: [
        {
          id: "w1",
          text: "Total",
          poly: [
            [10, 10],
            [50, 10],
            [50, 30],
            [10, 30],
          ],
          conf: 0.99,
        },
        {
          id: "w2",
          text: "1O5",
          poly: [
            [55, 10],
            [90, 10],
            [90, 30],
            [55, 30],
          ],
          conf: 0.6,
        },
      ],
    },
  ],
};

describe("labelling regions", () => {
  it("converts boxes and polygons both ways", () => {
    const box = { x: 1, y: 2, width: 10, height: 5 };
    expect(polyToBox(boxToPoly(box))).toEqual(box);
  });

  it("reads words from a canonical OCR prediction in reading order", () => {
    const words = wordsFromPrediction(page);
    expect(words.map((w) => [w.text, w.conf, w.lineId])).toEqual([
      ["Total", 0.99, "l1"],
      ["1O5", 0.6, "l1"],
    ]);
    expect(words[1]?.box).toEqual({ x: 55, y: 10, width: 35, height: 20 });
  });

  it("ignores a malformed prediction instead of crashing the editor", () => {
    expect(wordsFromPrediction({ nope: true })).toEqual([]);
  });

  it("round-trips through a saved annotation and drops degenerate boxes", () => {
    const words = [
      ...wordsFromPrediction(page),
      { id: "tiny", text: "x", box: { x: 0, y: 0, width: 1, height: 9 }, conf: null },
    ];
    const annotation = annotationFromWords(words);
    expect(annotation.regions).toHaveLength(2);
    expect(wordsFromAnnotation(annotation).map((w) => w.text)).toEqual(["Total", "1O5"]);
  });

  it("normalises boxes drawn up and to the left", () => {
    expect(normaliseBox({ x: 50, y: 40, width: -20, height: -10 })).toEqual({
      x: 30,
      y: 30,
      width: 20,
      height: 10,
    });
  });
});
