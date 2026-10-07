import { BUILTIN_TASK_TYPES } from "./builtin/index.js";
import { TaskTypeRegistry } from "./registry.js";

export * from "./define.js";
export * from "./registry.js";
export * from "./builtin/index.js";

/** Registry with every built-in task type. */
export function createDefaultRegistry(): TaskTypeRegistry {
  return new TaskTypeRegistry(BUILTIN_TASK_TYPES);
}
