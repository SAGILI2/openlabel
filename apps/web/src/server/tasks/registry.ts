import "server-only";
import { createDefaultRegistry, type TaskTypeRegistry } from "@openlabel/contracts";

let registry: TaskTypeRegistry | undefined;

/** Task types available in this installation. Installed plugins register here (OL-E10). */
export function getTaskTypeRegistry(): TaskTypeRegistry {
  registry ??= createDefaultRegistry();
  return registry;
}
