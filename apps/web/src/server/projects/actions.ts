"use server";
import { redirect } from "next/navigation";
import { imageAnnotationSchema, parseCreateProjectInput } from "@openlabel/contracts";
import { AccessError, createProject, saveAnnotation } from "@openlabel/db";
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
