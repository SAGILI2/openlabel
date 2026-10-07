import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BUILTIN_TASK_TYPES,
  createDefaultRegistry,
  defineTaskType,
  InvalidTaskTypeError,
  TaskTypeRegistry,
  UnknownTaskTypeError,
} from "../../../src/tasks/index.js";
import { taskTypeContract } from "../../../src/testing/index.js";

const custom = defineTaskType({
  id: "image.keypoints",
  modality: "image",
  title: "Keypoints",
  description: "Place pose keypoints.",
  regionKind: "keypoints",
  annotation: z.object({ points: z.array(z.tuple([z.number(), z.number()])) }),
  prediction: z.object({ points: z.array(z.tuple([z.number(), z.number()])) }),
  metrics: [
    { key: "oks", label: "OKS", goal: "higher", unit: "ratio", description: "Object keypoint similarity." },
  ],
  exportFormats: ["coco"],
  examples: { annotation: { points: [[1, 2]] }, prediction: { points: [[1, 2]] } },
});

describe("TaskTypeRegistry", () => {
  it("includes OCR, classification, detection, transcription and NER by default", () => {
    const ids = createDefaultRegistry()
      .list()
      .map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "document.ocr",
        "document.classification",
        "image.classification",
        "image.detection",
        "audio.transcription",
        "text.ner",
      ]),
    );
    expect(ids).toHaveLength(BUILTIN_TASK_TYPES.length);
  });

  it("filters by modality", () => {
    expect(
      createDefaultRegistry()
        .list("audio")
        .map((d) => d.id),
    ).toEqual(["audio.transcription", "audio.classification"]);
  });

  it("rejects unknown task types with a typed error", () => {
    expect(() => createDefaultRegistry().get("image.teleport")).toThrow(UnknownTaskTypeError);
  });

  it("accepts a third-party task type that passes the contract", () => {
    for (const check of taskTypeContract(custom)) check.run();
    expect(createDefaultRegistry().register(custom).get("image.keypoints").title).toBe("Keypoints");
  });

  it("refuses duplicate ids", () => {
    const registry = new TaskTypeRegistry([custom]);
    expect(() => registry.register(custom)).toThrow(/already registered/);
  });

  it("refuses an id whose prefix disagrees with its modality", () => {
    expect(() => new TaskTypeRegistry([{ ...custom, id: "audio.keypoints" }])).toThrow(InvalidTaskTypeError);
  });

  it("refuses examples that don't match the schemas", () => {
    const broken = { ...custom, examples: { annotation: { points: "nope" }, prediction: { points: [] } } };
    expect(() => new TaskTypeRegistry([broken])).toThrow(/examples.annotation/);
  });

  it("refuses duplicate metric keys", () => {
    const metric = custom.metrics[0];
    expect(() => new TaskTypeRegistry([{ ...custom, metrics: [metric, metric] }])).toThrow(/duplicated/);
  });
});
