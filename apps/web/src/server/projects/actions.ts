"use server";
import { redirect } from "next/navigation";
import {
  assignSplits,
  classificationAnnotationSchema,
  imageAnnotationSchema,
  parseCreateProjectInput,
  splitPlanSchema,
} from "@openlabel/contracts";
import {
  AccessError,
  createExport,
  createFolder,
  createProject,
  deleteAssets,
  deleteFolder,
  getAsset,
  getProjectById,
  moveAssets,
  queueReocr,
  reocrTurned,
  renameFolder,
  reviewAsset,
  saveAnnotation,
  setRequestedReviewers,
  setProjectClasses,
  setReviewRules,
  submitForReview,
  submitManyForReview,
  reviewManyAssets,
  subtreeFolderIds,
  folderChildren,
  searchFolders,
} from "@openlabel/db";
import { EXPORTERS } from "@openlabel/exporters";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireOrgScope } from "../orgs";
import { getStore } from "../storage";
import { getTaskTypeRegistry } from "../tasks";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof AccessError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the form." };
  throw err;
}

const classesSchema = z
  .array(z.object({ key: z.string().max(60).optional(), name: z.string().trim().min(1).max(80) }))
  .max(200);

/** Creates a project in the active organisation and opens it. */
export async function createProjectAction(input: {
  name: string;
  slug: string;
  taskType: string;
  classes?: { name: string }[];
  multiLabel?: boolean;
}): Promise<ActionResult> {
  let slug: string;
  try {
    const { scope } = await requireOrgScope();
    const parsed = parseCreateProjectInput({ ...input, description: "" }, getTaskTypeRegistry());
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    const classes = classesSchema.parse(input.classes ?? []);
    if (parsed.data.taskType.endsWith(".classification") && classes.length === 0) {
      return { ok: false, error: "Add at least one class." };
    }
    const project = await createProject(scope, {
      ...parsed.data,
      classes,
      multiLabel: z.boolean().parse(input.multiLabel ?? false),
    });
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
    const id = z.uuid().parse(assetId);
    const project = await getProjectById(scope, (await getAsset(scope, id)).projectId);
    let annotation: Record<string, unknown>;
    if (project.taskType.endsWith(".classification")) {
      // Only the project's own classes, and exactly one unless the project allows several.
      const { labels } = classificationAnnotationSchema.parse(data);
      const known = new Set(project.classes.map((c) => c.key));
      const unique = [...new Set(labels)];
      if (unique.some((l) => !known.has(l))) return { ok: false, error: "That class isn't in this project." };
      if (!project.multiLabel && unique.length > 1)
        return { ok: false, error: "This project allows one class per file." };
      annotation = { labels: unique };
    } else {
      annotation = imageAnnotationSchema.parse(data);
    }
    const saved = await saveAnnotation(scope, id, annotation, z.number().int().min(0).parse(baseVersion));
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
  /** Export only this folder and its sub-folders; null = whole project. */
  folderId?: string | null;
  /** `approved` (default) or also pages still in review. */
  include?: "approved" | "reviewed";
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
      options: {
        split: plan,
        cropPadding: z.number().int().min(0).max(32).parse(input.cropPadding),
        ...(input.folderId ? { folderId: input.folderId } : {}),
      },
      ...(input.folderId
        ? { folderIds: await subtreeFolderIds(scope, project.id, z.uuid().parse(input.folderId)) }
        : {}),
      include: input.include === "reviewed" ? "reviewed" : "approved",
      assign: (ids) => assignSplits(ids, plan),
    });
    refresh();
    return { ok: true, data: { id: row.id, items: row.itemCount } };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- Folders ---------- */

const uuidOrNull = z.uuid().nullable();

export async function createFolderAction(
  projectId: string,
  parentId: string | null,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { scope } = await requireOrgScope();
    const folder = await createFolder(scope, z.uuid().parse(projectId), uuidOrNull.parse(parentId), name);
    refresh();
    return { ok: true, data: { id: folder.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function renameFolderAction(
  projectId: string,
  folderId: string,
  name: string,
): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await renameFolder(scope, z.uuid().parse(projectId), z.uuid().parse(folderId), name);
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFolderAction(
  projectId: string,
  folderId: string,
  withFiles = false,
): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    const r = await deleteFolder(scope, z.uuid().parse(projectId), z.uuid().parse(folderId), {
      withFiles: z.boolean().parse(withFiles),
    });
    await removeObjects(r.orphanKeys);
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Deletes files with their labels; their images leave storage once nothing else uses them. */
export async function deleteFilesAction(projectId: string, assetIds: string[]): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    const r = await deleteAssets(
      scope,
      z.uuid().parse(projectId),
      z.array(z.uuid()).max(5000).parse(assetIds),
    );
    await removeObjects(r.orphanKeys);
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Best effort: a leftover object only costs space and never shows up anywhere. */
async function removeObjects(keys: string[]): Promise<void> {
  const store = getStore();
  for (let i = 0; i < keys.length; i += 20) {
    await Promise.allSettled(keys.slice(i, i + 20).map((k) => store.delete(k)));
  }
}

export async function moveAssetsAction(
  projectId: string,
  assetIds: string[],
  folderId: string | null,
): Promise<ActionResult<{ moved: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const moved = await moveAssets(
      scope,
      z.uuid().parse(projectId),
      z.array(z.uuid()).max(5000).parse(assetIds),
      uuidOrNull.parse(folderId),
    );
    refresh();
    return { ok: true, data: { moved } };
  } catch (err) {
    return fail(err);
  }
}

/* ---------- Review ---------- */

const reviewerIdsSchema = z.array(z.uuid()).max(20);

export async function submitForReviewAction(assetId: string, reviewerIds: string[]): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await submitForReview(scope, z.uuid().parse(assetId), reviewerIdsSchema.parse(reviewerIds));
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Sends the chosen pages for review in one go; returns how many went and why others didn't. */
export async function submitManyForReviewAction(
  projectId: string,
  assetIds: string[],
  reviewerIds: string[],
): Promise<ActionResult<{ sent: number; skipped: number; reasons: string[] }>> {
  try {
    const { scope } = await requireOrgScope();
    const result = await submitManyForReview(
      scope,
      z.uuid().parse(projectId),
      z.array(z.uuid()).max(5000).parse(assetIds),
      reviewerIdsSchema.parse(reviewerIds),
    );
    refresh();
    return {
      ok: true,
      data: {
        sent: result.sent,
        skipped: result.skipped.length,
        reasons: [...new Set(result.skipped.map((s) => s.reason))],
      },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Approves or requests changes on many pages at once. */
export async function reviewManyAction(
  projectId: string,
  assetIds: string[],
  input: { decision: string; body: string },
): Promise<ActionResult<{ done: number; skipped: number; reasons: string[] }>> {
  try {
    const { scope } = await requireOrgScope();
    const result = await reviewManyAssets(
      scope,
      z.uuid().parse(projectId),
      z.array(z.uuid()).max(5000).parse(assetIds),
      {
        decision: z.enum(["approve", "request_changes"]).parse(input.decision),
        body: z.string().max(4000).parse(input.body),
      },
    );
    refresh();
    return {
      ok: true,
      data: {
        done: result.done,
        skipped: result.skipped.length,
        reasons: [...new Set(result.skipped.map((s) => s.reason))],
      },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setRequestedReviewersAction(
  assetId: string,
  reviewerIds: string[],
): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await setRequestedReviewers(scope, z.uuid().parse(assetId), reviewerIdsSchema.parse(reviewerIds));
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewAction(
  assetId: string,
  input: { decision: string; body: string; version: number },
): Promise<ActionResult<{ status: string }>> {
  try {
    const { scope } = await requireOrgScope();
    const state = await reviewAsset(scope, z.uuid().parse(assetId), {
      decision: z.enum(["approve", "request_changes", "comment"]).parse(input.decision),
      body: z.string().max(4000).parse(input.body),
      version: z.number().int().min(1).parse(input.version),
    });
    refresh();
    return { ok: true, data: { status: state.status } };
  } catch (err) {
    return fail(err);
  }
}

export async function setReviewRulesAction(
  projectId: string,
  input: { requiredApprovals: number; allowSelfApproval: boolean; defaultReviewerIds: string[] },
): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await setReviewRules(scope, z.uuid().parse(projectId), {
      requiredApprovals: z.number().int().min(1).max(5).parse(input.requiredApprovals),
      allowSelfApproval: z.boolean().parse(input.allowSelfApproval),
      defaultReviewerIds: reviewerIdsSchema.parse(input.defaultReviewerIds),
    });
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Sub-folders of one folder for the tree, loaded when it's opened. */
export async function folderChildrenAction(
  projectId: string,
  folderId: string,
): Promise<
  ActionResult<{ id: string; name: string; path: string; totalCount: number; hasChildren: boolean }[]>
> {
  try {
    const { scope } = await requireOrgScope();
    const rows = await folderChildren(scope, z.uuid().parse(projectId), z.uuid().parse(folderId));
    return { ok: true, data: rows };
  } catch (err) {
    return fail(err);
  }
}

/** Folders matching a search, for the move and folder pickers. */
export async function searchFoldersAction(
  projectId: string,
  term: string,
): Promise<ActionResult<{ id: string; path: string }[]>> {
  try {
    const { scope } = await requireOrgScope();
    const rows = await searchFolders(scope, z.uuid().parse(projectId), z.string().max(200).parse(term), 50);
    return { ok: true, data: rows.map((r) => ({ id: r.id, path: r.path })) };
  } catch (err) {
    return fail(err);
  }
}

/** Reads the chosen files again with OCR; labels people saved are kept. */
export async function reocrFilesAction(
  projectId: string,
  assetIds: string[],
): Promise<ActionResult<{ queued: number; skipped: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const r = await queueReocr(scope, z.uuid().parse(projectId), {
      assetIds: z.array(z.uuid()).max(100_000).parse(assetIds),
    });
    refresh();
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

/** Reads every file whose OCR found no text again (they are often turned the wrong way). */
export async function reocrNoTextAction(
  projectId: string,
): Promise<ActionResult<{ queued: number; skipped: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const r = await queueReocr(scope, z.uuid().parse(projectId), "no-text");
    refresh();
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

/** A person turned the page: read it that way, and remember their answer for orientation metrics. */
export async function reocrTurnedAction(assetId: string, rotate: number, page = 1): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await reocrTurned(
      scope,
      z.uuid().parse(assetId),
      z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).parse(rotate),
      z.number().int().min(1).max(10_000).parse(page),
    );
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Replaces a project's classes; classes already used in labels can be renamed but not removed. */
export async function setProjectClassesAction(
  projectId: string,
  input: { classes: { key?: string; name: string }[]; multiLabel: boolean },
): Promise<ActionResult<{ classes: { key: string; name: string }[] }>> {
  try {
    const { scope } = await requireOrgScope();
    const row = await setProjectClasses(scope, z.uuid().parse(projectId), {
      classes: classesSchema.parse(input.classes),
      multiLabel: z.boolean().parse(input.multiLabel),
    });
    refresh();
    return { ok: true, data: { classes: row.classes } };
  } catch (err) {
    return fail(err);
  }
}
