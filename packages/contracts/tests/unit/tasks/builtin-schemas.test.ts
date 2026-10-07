import { describe, expect, it } from "vitest";
import {
  audioTranscription,
  imageClassification,
  imageDetection,
  textNer,
} from "../../../src/tasks/index.js";

describe("built-in task schemas", () => {
  it("classification needs at least one label", () => {
    expect(imageClassification.annotation.safeParse({ labels: [] }).success).toBe(false);
  });

  it("detection rejects an inverted box", () => {
    const bad = { objects: [{ id: "o", label: "car", bbox: [50, 10, 10, 40] }] };
    expect(imageDetection.annotation.safeParse(bad).success).toBe(false);
  });

  it("detection predictions require a confidence (null allowed, never invented)", () => {
    expect(
      imageDetection.prediction.safeParse({ objects: [{ id: "p", label: "car", bbox: [0, 0, 1, 1] }] })
        .success,
    ).toBe(false);
    expect(
      imageDetection.prediction.safeParse({
        objects: [{ id: "p", label: "car", bbox: [0, 0, 1, 1], conf: null }],
      }).success,
    ).toBe(true);
  });

  it("transcription segments must end after they start", () => {
    const bad = { segments: [{ id: "s", start: 3, end: 2, text: "x" }] };
    expect(audioTranscription.annotation.safeParse(bad).success).toBe(false);
  });

  it("NER spans use integer offsets with end after start", () => {
    expect(
      textNer.annotation.safeParse({ spans: [{ id: "e", start: 4, end: 4, label: "ORG" }] }).success,
    ).toBe(false);
    expect(
      textNer.annotation.safeParse({ spans: [{ id: "e", start: 0.5, end: 4, label: "ORG" }] }).success,
    ).toBe(false);
  });
});
