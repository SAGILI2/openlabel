import type { TaskTypeDefinition } from "../tasks/define.js";
import { validateTaskType } from "../tasks/registry.js";

/** One check in the task-type contract, runnable with any test runner. */
export interface ContractCheck {
  name: string;
  run: () => void;
}

class ContractViolation extends Error {
  constructor(taskTypeId: string, message: string) {
    super(`[${taskTypeId}] ${message}`);
    this.name = "ContractViolation";
  }
}

function assert(id: string, condition: boolean, message: string): void {
  if (!condition) throw new ContractViolation(id, message);
}

/**
 * The checks every task-type plugin must pass, built-in or third-party. Returned as plain
 * functions so plugins can run them under any test runner:
 *
 * ```ts
 * for (const check of taskTypeContract(myTask)) it(check.name, check.run);
 * ```
 */
export function taskTypeContract(def: TaskTypeDefinition): ContractCheck[] {
  const id = def.id;
  return [
    {
      name: "is structurally valid (id, modality prefix, text, metric keys, examples)",
      run: () => {
        const problems = validateTaskType(def);
        assert(id, problems.length === 0, problems.join("; "));
      },
    },
    {
      name: "annotation schema rejects values that are not objects",
      run: () => {
        for (const bad of [null, 42, "text", []]) {
          assert(id, !def.annotation.safeParse(bad).success, `annotation accepted ${JSON.stringify(bad)}`);
        }
      },
    },
    {
      name: "prediction schema rejects values that are not objects",
      run: () => {
        for (const bad of [null, 42, "text", []]) {
          assert(id, !def.prediction.safeParse(bad).success, `prediction accepted ${JSON.stringify(bad)}`);
        }
      },
    },
    {
      name: "examples survive a JSON round trip (stored as JSONB)",
      run: () => {
        const annotation = def.annotation.parse(def.examples.annotation);
        const prediction = def.prediction.parse(def.examples.prediction);
        assert(
          id,
          def.annotation.safeParse(JSON.parse(JSON.stringify(annotation))).success,
          "annotation example changes after JSON round trip",
        );
        assert(
          id,
          def.prediction.safeParse(JSON.parse(JSON.stringify(prediction))).success,
          "prediction example changes after JSON round trip",
        );
      },
    },
    {
      name: "metric keys are snake_case and every metric is described",
      run: () => {
        for (const m of def.metrics) {
          assert(id, /^[a-z][a-z0-9_]*$/.test(m.key), `metric key "${m.key}" is not snake_case`);
          assert(
            id,
            m.label.trim().length > 0 && m.description.trim().length > 0,
            `metric "${m.key}" lacks text`,
          );
        }
      },
    },
    {
      name: "export formats are listed as kebab-case ids",
      run: () => {
        assert(id, def.exportFormats.length > 0, "no export formats");
        for (const f of def.exportFormats) {
          assert(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f), `export format "${f}" is not kebab-case`);
        }
      },
    },
  ];
}
