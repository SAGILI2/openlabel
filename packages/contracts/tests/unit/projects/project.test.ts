import { describe, expect, it } from "vitest";
import { parseCreateProjectInput } from "../../../src/projects/index.js";
import { createDefaultRegistry } from "../../../src/tasks/index.js";

const registry = createDefaultRegistry();
const base = { name: "Invoices", slug: "invoices" };

describe("parseCreateProjectInput", () => {
  it("derives the modality from the task type", () => {
    const result = parseCreateProjectInput({ ...base, taskType: "audio.transcription" }, registry);
    expect(result.success && result.data.modality).toBe("audio");
  });

  it("rejects an unknown task type", () => {
    const result = parseCreateProjectInput({ ...base, taskType: "image.teleport" }, registry);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0]?.message).toMatch(/unknown task type/);
  });

  it("rejects a malformed task type id", () => {
    expect(parseCreateProjectInput({ ...base, taskType: "ocr" }, registry).success).toBe(false);
  });

  it("rejects a slug with spaces or capitals", () => {
    expect(
      parseCreateProjectInput({ ...base, slug: "My Project", taskType: "document.ocr" }, registry).success,
    ).toBe(false);
  });
});
