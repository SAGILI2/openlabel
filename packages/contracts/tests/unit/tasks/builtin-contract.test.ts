import { describe, it } from "vitest";
import { BUILTIN_TASK_TYPES } from "../../../src/tasks/index.js";
import { taskTypeContract } from "../../../src/testing/index.js";

// Every built-in task type, OCR included, must pass the same plugin contract.
for (const def of BUILTIN_TASK_TYPES) {
  describe(`task type ${def.id}`, () => {
    for (const check of taskTypeContract(def)) it(check.name, check.run);
  });
}
