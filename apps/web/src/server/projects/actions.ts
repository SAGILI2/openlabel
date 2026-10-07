"use server";
import { redirect } from "next/navigation";
import {
  assignSplits,
  imageAnnotationSchema,
  parseCreateProjectInput,
  splitPlanSchema,
} from "@openlabel/contracts";
import { AccessError, createExport, createProject, getProjectById, saveAnnotation } from "@openlabel/db";
import { EXPORTERS } from "@openlabel/exporters";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireOrgScope } from "../orgs";
import { getTaskTypeRegistry } from "../tasks";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof AccessError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the form." };
  throw err;
}

/** Creates a project in the active organisation and opens it. */
export async function createProjectAction(input: {
  name: string;
  slug: string;
  taskType: string;
}): Promise<ActionResult> {
  let slug: string;
  try {
    const { scope } = await requireOrgScope();
    const parsed = parseCreateProjectInput({ ...input, description: "" }, getTaskTypeRegistry());
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    const project = await createProject(scope, parsed.data);
    slug = project.slug;
  } catch (err) {
    return fail(err);
  }
  redirect(`/projects/${slug}`);
}

/** Saves the editor's regions as a new annotation version. */
export async function saveAnnotationAction(
  assetId: string,
  data: unknown,
  baseVersion: number,
): Promise<ActionResult<{ version: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const annotation = imageAnnotationSchema.parse(data);
    const saved = await saveAnnotation(
      scope,
      z.uuid().parse(assetId),
      annotation,
      z.number().int().min(0).parse(baseVersion),
    );
    return { ok: true, data: saved };
  } catch (err) {
    return fail(err);
  }
}

/** Freezes the project's labelled items into a new export and queues the files to be written. */
export async function createExportAction(input: {
  projectId: string;
  name: string;
  format: string;
  train: number;
  val: number;
  test: number;
  cropPadding: number;
}): Promise<ActionResult<{ id: string; items: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const project = await getProjectById(scope, z.uuid().parse(input.projectId));
    const exporter = EXPORTERS.get(input.format);
    if (!exporter || !exporter.taskTypes.includes(project.taskType)) {
      return { ok: false, error: "That format isn't available for this project." };
    }
    const plan = splitPlanSchema.parse({
      train: input.train,
      val: input.val,
      test: input.test,
      seed: project.id,
    });
    const name = z.string().trim().min(1, "Give the export a name.").max(120).parse(input.name);
    const row = await createExport(scope, {
      projectId: project.id,
      name,
      format: exporter.id,
      options: { split: plan, cropPadding: z.number().int().min(0).max(32).parse(input.cropPadding) },
      assign: (ids) => assignSplits(ids, plan),
    });
    refresh();
    return { ok: true, data: { id: row.id, items: row.itemCount } };
  } catch (err) {
    return fail(err);
  }
}
