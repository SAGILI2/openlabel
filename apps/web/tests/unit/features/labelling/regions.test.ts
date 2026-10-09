import { describe, expect, it } from "vitest";
import {
  annotationFromWords,
  boxToPoly,
  documentAnnotation,
  needsCheck,
  wordState,
  normaliseBox,
  polyToBox,
  turnBox,
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

  it("reads words from a canonical OCR prediction, leaving line grouping to the editor", () => {
    const words = wordsFromPrediction(page);
    expect(words.map((w) => [w.text, w.conf, w.lineId])).toEqual([
      ["Total", 0.99, undefined],
      ["1O5", 0.6, undefined],
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

describe("multi-page documents", () => {
  const box = { x: 1, y: 1, width: 10, height: 10 };
  it("prefixes prediction ids with the page so pages never collide", () => {
    expect(wordsFromPrediction(page, 3).map((w) => w.id)).toEqual(["p3-w1", "p3-w2"]);
  });

  it("keeps other pages when saving one and records which pages were checked", () => {
    const saved = annotationFromWords([{ id: "a", text: "one", box, conf: null }], 1);
    const p2 = annotationFromWords([{ id: "b", text: "two", box, conf: null }], 2);
    const doc = documentAnnotation(saved.regions, p2, 2, [1]);
    expect(doc.regions.map((r) => [r.id, r.page])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(doc.pages).toEqual([1, 2]);
    // Saving page 2 again replaces its regions only.
    const again = documentAnnotation(doc.regions, annotationFromWords([], 2), 2, doc.pages ?? []);
    expect(again.regions.map((r) => r.id)).toEqual(["a"]);
    expect(wordsFromAnnotation(doc, 2).map((w) => w.text)).toEqual(["two"]);
  });
});

describe("word edit state", () => {
  const box = { x: 1, y: 1, width: 10, height: 10 };
  const ocr = { id: "w", text: "Total", box, conf: 0.6, ocrText: "Total" };

  it("is not an edit when the same text is typed back", () => {
    expect(wordState({ ...ocr, text: "Total" })).toBe("ocr");
    expect(needsCheck(ocr)).toBe(true);
  });

  it("counts a change of case as a correction", () => {
    expect(wordState({ ...ocr, text: "TOTAL" })).toBe("edited");
    expect(wordState({ ...ocr, text: "Total " })).toBe("edited");
    expect(needsCheck({ ...ocr, text: "TOTAL" })).toBe(false);
  });

  it("confirms without editing, and drawn boxes have no OCR text", () => {
    expect(wordState({ ...ocr, verified: true })).toBe("verified");
    expect(needsCheck({ ...ocr, verified: true })).toBe(false);
    expect(wordState({ id: "u1", text: "x", box, conf: null })).toBe("drawn");
  });

  it("keeps the OCR reading and confirmation through a save", () => {
    const saved = annotationFromWords([
      { ...ocr, text: "TOTAL" },
      { ...ocr, id: "v", verified: true },
    ]);
    const back = wordsFromAnnotation(saved);
    expect(back.map(wordState)).toEqual(["edited", "verified"]);
    expect(back[0]?.ocrText).toBe("Total");
    expect(back[0]?.conf).toBe(0.6);
  });

  it("reads older labels: a word without confidence was checked by a person", () => {
    const old = {
      tags: [],
      regions: [
        {
          id: "w1",
          kind: "text",
          label: "word",
          poly: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          text: "A",
        },
      ],
    };
    expect(wordsFromAnnotation(old).map(wordState)).toEqual(["verified"]);
  });
});

describe("turning a page", () => {
  // A 100×40 page with a box near its top-left corner.
  const box = { x: 10, y: 5, width: 20, height: 10 };
  it("moves boxes the way the page turns (counter-clockwise)", () => {
    expect(turnBox(box, 90, 100, 40)).toEqual({ x: 5, y: 70, width: 10, height: 20 });
    expect(turnBox(box, 180, 100, 40)).toEqual({ x: 70, y: 25, width: 20, height: 10 });
    expect(turnBox(box, 270, 100, 40)).toEqual({ x: 25, y: 10, width: 10, height: 20 });
    expect(turnBox(box, 0, 100, 40)).toEqual(box);
  });
  it("comes back to the start after a full turn", () => {
    const quarter = turnBox(box, 90, 100, 40);
    const half = turnBox(quarter, 90, 40, 100);
    expect(turnBox(turnBox(half, 90, 100, 40), 90, 40, 100)).toEqual(box);
  });
});
