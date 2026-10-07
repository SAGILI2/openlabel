import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { annotations, assets, folders, predictions, projects } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { enqueueJob } from "./jobs.js";
import { requireRole, type OrgScope } from "./scope.js";

type AssetKind = (typeof assets.$inferSelect)["kind"];
export type AssetStatus = (typeof assets.$inferSelect)["status"];

export interface AssetRow {
  id: string;
  projectId: string;
  folderId: string | null;
  kind: AssetKind;
  storageKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  originalName: string;
  mediaMeta: Record<string, unknown>;
  status: AssetStatus;
  createdAt: Date;
}

const columns = {
  id: assets.id,
  projectId: assets.projectId,
  folderId: assets.folderId,
  kind: assets.kind,
  storageKey: assets.storageKey,
  sha256: assets.sha256,
  byteSize: assets.byteSize,
  mimeType: assets.mimeType,
  originalName: assets.originalName,
  mediaMeta: assets.mediaMeta,
  status: assets.status,
  createdAt: assets.createdAt,
};

async function projectInScope(scope: OrgScope, projectId: string): Promise<void> {
  const [row] = await scope.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Project not found.");
}

/**
 * Records an uploaded file and queues it for pre-labelling. Uploading the same bytes to the
 * same project again returns the existing asset (`created: false`).
 */
export async function registerAsset(
  scope: OrgScope,
  input: {
    projectId: string;
    /** Folder to put the file in; null/omitted = project root. Must belong to the project. */
    folderId?: string | null;
    kind: AssetKind;
    storageKey: string;
    sha256: string;
    byteSize: number;
    mimeType: string;
    originalName: string;
    mediaMeta: Record<string, unknown>;
  },
): Promise<{ asset: AssetRow; created: boolean }> {
  requireRole(scope, "manager");
  await projectInScope(scope, input.projectId);
  if (input.folderId) {
    const [folder] = await scope.db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, input.folderId), eq(folders.projectId, input.projectId)));
    if (!folder) throw new AccessError("NOT_FOUND", "Folder not found.");
  }
  return scope.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(assets)
      .values({ ...input, orgId: scope.orgId })
      .onConflictDoNothing({ target: [assets.projectId, assets.sha256] })
      .returning(columns);
    const created = inserted[0];
    if (created) {
      await enqueueJob(tx, {
        orgId: scope.orgId,
        kind: "prelabel",
        payload: { assetId: created.id },
        dedupeKey: `prelabel:${created.id}`,
      });
      return { asset: created, created: true };
    }
    const [existing] = await tx
      .select(columns)
      .from(assets)
      .where(and(eq(assets.projectId, input.projectId), eq(assets.sha256, input.sha256)));
    if (!existing) throw new Error("conflicting asset vanished");
    return { asset: existing, created: false };
  });
}

/**
 * Assets of a project in the scoped organisation, oldest first. `folders` narrows the listing:
 * undefined = whole project, null = files at the project root only, an id list = files directly
 * in those folders.
 */
export async function listAssets(
  scope: OrgScope,
  projectId: string,
  folders?: string[] | null,
): Promise<AssetRow[]> {
  await projectInScope(scope, projectId);
  const inFolder =
    folders === undefined
      ? undefined
      : folders === null
        ? isNull(assets.folderId)
        : folders.length === 0
          ? sql`false`
          : inArray(assets.folderId, folders);
  return scope.db
    .select(columns)
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId), inFolder))
    .orderBy(asc(assets.createdAt));
}

export async function getAsset(scope: OrgScope, assetId: string): Promise<AssetRow> {
  const [row] = await scope.db
    .select(columns)
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Asset not found.");
  return row;
}

/** Status counts for a project's progress bar. */
export async function assetStatusCounts(
  scope: OrgScope,
  projectId: string,
): Promise<Partial<Record<AssetStatus, number>>> {
  const rows = await scope.db
    .select({ status: assets.status, n: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId)))
    .groupBy(assets.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export interface LabellingState {
  asset: AssetRow;
  prediction: {
    engine: string;
    engineVersion: string;
    result: Record<string, unknown>;
    createdAt: Date;
  } | null;
  annotation: { version: number; data: Record<string, unknown>; createdAt: Date } | null;
}

/** Everything the editor needs: the asset, its latest prediction and latest annotation. */
export async function getLabellingState(scope: OrgScope, assetId: string): Promise<LabellingState> {
  const asset = await getAsset(scope, assetId);
  const [prediction] = await scope.db
    .select({
      engine: predictions.engine,
      engineVersion: predictions.engineVersion,
      result: predictions.result,
      createdAt: predictions.createdAt,
    })
    .from(predictions)
    .where(and(eq(predictions.assetId, assetId), eq(predictions.orgId, scope.orgId)))
    .orderBy(desc(predictions.createdAt))
    .limit(1);
  const [annotation] = await scope.db
    .select({ version: annotations.version, data: annotations.data, createdAt: annotations.createdAt })
    .from(annotations)
    .where(and(eq(annotations.assetId, assetId), eq(annotations.orgId, scope.orgId)))
    .orderBy(desc(annotations.version))
    .limit(1);
  return { asset, prediction: prediction ?? null, annotation: annotation ?? null };
}

/**
 * Saves a new annotation version. `baseVersion` is the version the editor started from; if
 * someone saved in between, the save is refused (CONFLICT) instead of silently overwriting.
 */
export async function saveAnnotation(
  scope: OrgScope,
  assetId: string,
  data: Record<string, unknown>,
  baseVersion: number,
): Promise<{ version: number }> {
  requireRole(scope, "labeller");
  await getAsset(scope, assetId);
  return scope.db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: annotations.version })
      .from(annotations)
      .where(eq(annotations.assetId, assetId))
      .orderBy(desc(annotations.version))
      .limit(1)
      .for("update");
    const current = latest?.version ?? 0;
    if (current !== baseVersion) {
      throw new AccessError("CONFLICT", "Someone else saved this item. Reload to see their changes.");
    }
    const version = current + 1;
    await tx
      .insert(annotations)
      .values({ orgId: scope.orgId, assetId, version, data, authorUserId: scope.userId });
    // Saving is work in progress; sending for review is a separate step (submitForReview).
    // An already-submitted or approved page goes back to in-progress, so stale approvals never count.
    await tx
      .update(assets)
      .set({
        status: sql`case when ${assets.status} = 'rejected' then 'rejected'::asset_status else 'in_progress'::asset_status end`,
      })
      .where(eq(assets.id, assetId));
    return { version };
  });
}
