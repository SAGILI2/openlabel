"use server";
import { redirect } from "next/navigation";
import {
  assignSplits,
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
  getProjectById,
  moveAssets,
  renameFolder,
  reviewAsset,
  saveAnnotation,
  setRequestedReviewers,
  setReviewRules,
  submitForReview,
  submitManyForReview,
  reviewManyAssets,
  subtreeFolderIds,
  pageAssets,
  folderTree,
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

export interface BrowserRow {
  id: string;
  name: string;
  status: "new" | "prelabelling" | "prelabelled" | "in_progress" | "submitted" | "approved" | "rejected";
  width: number | null;
  height: number | null;
  folderPath: string | null;
}

/** Next page of files for the file browser's infinite scroll. */
export async function loadMoreFilesAction(input: {
  projectId: string;
  folder: string;
  filter: string;
  page: number;
  pageSize: number;
}): Promise<ActionResult<{ rows: BrowserRow[]; total: number }>> {
  try {
    const { scope } = await requireOrgScope();
    const projectId = z.uuid().parse(input.projectId);
    const filter = z.enum(["all", "mine", "todo", "review", "done", "ocr"]).parse(input.filter);
    const tree = await folderTree(scope, projectId);
    const paths = new Map<string, string>();
    const walk = (nodes: typeof tree.roots) => {
      for (const n of nodes) {
        paths.set(n.id, n.path);
        walk(n.children);
      }
    };
    walk(tree.roots);
    const folder = input.folder;
    const folders =
      folder === "all"
        ? undefined
        : folder === "root"
          ? null
          : paths.has(folder)
            ? await subtreeFolderIds(scope, projectId, folder)
            : undefined;
    const listing = await pageAssets(scope, projectId, {
      folders,
      filter,
      page: z.number().int().min(1).max(100_000).parse(input.page),
      pageSize: z.number().int().min(1).max(500).parse(input.pageSize),
    });
    return {
      ok: true,
      data: {
        total: listing.total,
        rows: listing.rows.map((a) => ({
          id: a.id,
          name: a.originalName,
          status: a.status,
          width: typeof a.mediaMeta.width === "number" ? a.mediaMeta.width : null,
          height: typeof a.mediaMeta.height === "number" ? a.mediaMeta.height : null,
          folderPath: a.folderId ? (paths.get(a.folderId) ?? null) : null,
        })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}
