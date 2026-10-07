import { z } from "zod";
import { modalitySchema, taskTypeIdSchema } from "../tasks/define.js";
import type { TaskTypeRegistry } from "../tasks/registry.js";

/** URL-safe project handle, unique within an organisation. */
export const projectSlugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "use lowercase letters, numbers and single hyphens" });

/** Input for creating a project. The task type decides the editor, labels and metrics. */
export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: projectSlugSchema,
  description: z.string().trim().max(2000).default(""),
  taskType: taskTypeIdSchema,
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

/**
 * Validates project input against the task types this installation actually has, and derives
 * the modality from the task type so the two can never disagree.
 */
export function parseCreateProjectInput(input: unknown, registry: TaskTypeRegistry) {
  const schema = createProjectInputSchema.superRefine((value, ctx) => {
    if (!registry.has(value.taskType)) {
      ctx.addIssue({
        code: "custom",
        path: ["taskType"],
        message: `unknown task type "${value.taskType}"`,
      });
    }
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return parsed;
  const modality = modalitySchema.parse(registry.get(parsed.data.taskType).modality);
  return { success: true as const, data: { ...parsed.data, modality } };
}
