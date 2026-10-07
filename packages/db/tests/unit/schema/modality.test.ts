import { describe, expect, it } from "vitest";
import { MODALITIES } from "@openlabel/contracts";
import { modality } from "../../../src/schema/projects.js";

describe("modality enum", () => {
  it("matches the modalities task types are defined for", () => {
    expect([...modality.enumValues]).toEqual([...MODALITIES]);
  });
});
