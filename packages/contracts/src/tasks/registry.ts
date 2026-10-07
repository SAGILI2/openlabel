import { taskTypeIdSchema, type Modality, type TaskTypeDefinition } from "./define.js";

export class UnknownTaskTypeError extends Error {
  readonly code = "TASK_TYPE_UNKNOWN";
  constructor(readonly taskTypeId: string) {
    super(`Unknown task type "${taskTypeId}"`);
    this.name = "UnknownTaskTypeError";
  }
}

export class InvalidTaskTypeError extends Error {
  readonly code = "TASK_TYPE_INVALID";
  constructor(
    readonly taskTypeId: string,
    readonly problems: string[],
  ) {
    super(`Task type "${taskTypeId}" is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "InvalidTaskTypeError";
  }
}

/** Structural checks every task type must pass before it can be registered. */
export function validateTaskType(def: TaskTypeDefinition): string[] {
  const problems: string[] = [];
  if (!taskTypeIdSchema.safeParse(def.id).success) problems.push(`id "${def.id}" is not <modality>.<task>`);
  if (!def.id.startsWith(`${def.modality}.`))
    problems.push(`id must start with its modality "${def.modality}."`);
  if (!def.title.trim()) problems.push("title is empty");
  if (!def.description.trim()) problems.push("description is empty");
  const keys = def.metrics.map((m) => m.key);
  const duplicate = keys.find((k, i) => keys.indexOf(k) !== i);
  if (duplicate) problems.push(`metric key "${duplicate}" is duplicated`);
  if (!def.annotation.safeParse(def.examples.annotation).success) {
    problems.push("examples.annotation does not match the annotation schema");
  }
  if (!def.prediction.safeParse(def.examples.prediction).success) {
    problems.push("examples.prediction does not match the prediction schema");
  }
  return problems;
}

/** Lookup table of task types. The platform builds one at start-up from built-in and installed plugins. */
export class TaskTypeRegistry {
  readonly #types = new Map<string, TaskTypeDefinition>();

  constructor(definitions: Iterable<TaskTypeDefinition> = []) {
    for (const def of definitions) this.register(def);
  }

  /** Adds a task type after validating it. Ids are unique; re-registering is an error. */
  register(def: TaskTypeDefinition): this {
    const problems = validateTaskType(def);
    if (this.#types.has(def.id)) problems.push("already registered");
    if (problems.length > 0) throw new InvalidTaskTypeError(def.id, problems);
    this.#types.set(def.id, def);
    return this;
  }

  has(id: string): boolean {
    return this.#types.has(id);
  }

  /** The task type for `id`; throws {@link UnknownTaskTypeError} so callers can reject bad input. */
  get(id: string): TaskTypeDefinition {
    const def = this.#types.get(id);
    if (!def) throw new UnknownTaskTypeError(id);
    return def;
  }

  /** Every task type, optionally for one modality, in registration order. */
  list(modality?: Modality): TaskTypeDefinition[] {
    const all = [...this.#types.values()];
    return modality ? all.filter((d) => d.modality === modality) : all;
  }
}
