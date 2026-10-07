import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { annotations, assets, auditEvents, exportItems, exports, projects } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { enqueueJob } from "./jobs.js";
import { requireRole, type OrgScope } from "./scope.js";

type Split = (typeof exportItems.$inferSelect)["split"];
type ExportStatus = (typeof exports.$inferSelect)["status"];

export interface ExportRow {
  id: string;
  projectId: string;
  name: string;
  format: string;
  options: Record<string, unknown>;
  status: ExportStatus;
  itemCount: number;
  stats: Record<string, unknown>;
  storageKey: string | null;
  byteSize: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

const columns = {
  id: exports.id,
  projectId: exports.projectId,
  name: exports.name,
  format: exports.format,
  options: exports.options,
  status: exports.status,
  itemCount: exports.itemCount,
  stats: exports.stats,
  storageKey: exports.storageKey,
  byteSize: exports.byteSize,
  error: exports.error,
  createdAt: exports.createdAt,
  finishedAt: exports.finishedAt,
};

/** Latest annotation of every labelled asset in a project: what an export would freeze. */
export async function latestAnnotations(
  scope: OrgScope,
  projectId: string,
  /** Only assets directly in these folders; undefined = whole project. */
  folderIds?: string[],
  /** `approved` = only reviewed-and-approved pages; `reviewed` = approved or waiting for review. */
  include: "approved" | "reviewed" | "all" = "all",
): Promise<{ assetId: string; annotationId: string; version: number }[]> {
  const statuses =
    include === "approved"
      ? sql`a.status = 'approved'`
      : include === "reviewed"
        ? sql`a.status in ('approved', 'submitted')`
        : sql`true`;
  const inFolders =
    folderIds === undefined
      ? sql`true`
      : folderIds.length === 0
        ? sql`false`
        : sql`a.folder_id in (${sql.join(
            folderIds.map((f) => sql`${f}::uuid`),
            sql`, `,
          )})`;
  const rows = await scope.db.execute<{ asset_id: string; annotation_id: string; version: number }>(sql`
    select distinct on (an.asset_id) an.asset_id, an.id as annotation_id, an.version
    from ${annotations} an
    join ${assets} a on a.id = an.asset_id
    where a.project_id = ${projectId} and a.org_id = ${scope.orgId} and ${inFolders} and ${statuses}
    order by an.asset_id, an.version desc`);
  return rows.map((r) => ({ assetId: r.asset_id, annotationId: r.annotation_id, version: r.version }));
}

/**
 * Freezes the latest annotation of every labelled asset into a new export with the given split
 * assignment, and queues the job that writes the files. `assign` maps asset id → split; assets
 * it leaves out are not exported.
 */
export async function createExport(
  scope: OrgScope,
  input: {
    projectId: string;
    name: string;
    format: string;
    options: Record<string, unknown>;
    /** Limit to files directly in these folders (pass a subtree's ids); undefined = whole project. */
    folderIds?: string[];
    /** Which pages qualify by review state (default: approved only). */
    include?: "approved" | "reviewed";
    assign: (assetIds: string[]) => Map<string, Split>;
  },
): Promise<ExportRow> {
  requireRole(scope, "manager");
  const [project] = await scope.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.orgId, scope.orgId)));
  if (!project) throw new AccessError("NOT_FOUND", "Project not found.");

  const include = input.include ?? "approved";
  const latest = await latestAnnotations(scope, input.projectId, input.folderIds, include);
  if (latest.length === 0) {
    throw new AccessError(
      "CONFLICT",
      include === "approved"
        ? "No approved pages yet. Approve some pages, or include pages still in review."
        : "Nothing to export yet. Label and send some pages for review.",
    );
  }
  const splits = input.assign(latest.map((l) => l.assetId));
  const items = latest.flatMap((l) => {
    const split = splits.get(l.assetId);
    return split ? [{ assetId: l.assetId, annotationId: l.annotationId, split }] : [];
  });

  return scope.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(exports)
      .values({
        orgId: scope.orgId,
        projectId: input.projectId,
        name: input.name,
        format: input.format,
        options: input.options,
        itemCount: items.length,
        createdByUserId: scope.userId,
      })
      .returning(columns);
    if (!row) throw new Error("insert returned no row");
    for (let i = 0; i < items.length; i += 1000) {
      await tx
        .insert(exportItems)
        .values(items.slice(i, i + 1000).map((it) => ({ ...it, exportId: row.id })));
    }
    await enqueueJob(tx, {
      orgId: scope.orgId,
      kind: "export",
      payload: { exportId: row.id },
      dedupeKey: `export:${row.id}`,
    });
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "export.created",
      resourceType: "export",
      resourceId: row.id,
      details: { format: input.format, items: items.length },
    });
    return row;
  });
}

export async function listExports(scope: OrgScope, projectId: string): Promise<ExportRow[]> {
  return scope.db
    .select(columns)
    .from(exports)
    .where(and(eq(exports.projectId, projectId), eq(exports.orgId, scope.orgId)))
    .orderBy(desc(exports.createdAt));
}

export async function getExport(scope: OrgScope, exportId: string): Promise<ExportRow> {
  const [row] = await scope.db
    .select(columns)
    .from(exports)
    .where(and(eq(exports.id, exportId), eq(exports.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Export not found.");
  return row;
}

/* ---------- Worker side: acts for the system, keyed by the export id from a queued job ---------- */

export interface ExportJobData {
  export: ExportRow & { orgId: string; projectName: string; taskType: string };
  items: {
    assetId: string;
    split: Split;
    storageKey: string;
    mimeType: string;
    originalName: string;
    mediaMeta: Record<string, unknown>;
    annotationVersion: number;
    annotation: Record<string, unknown>;
  }[];
}

export async function loadExportJob(db: Database, exportId: string): Promise<ExportJobData | null> {
  const [row] = await db
    .select({ ...columns, orgId: exports.orgId, projectName: projects.name, taskType: projects.taskType })
    .from(exports)
    .innerJoin(projects, eq(projects.id, exports.projectId))
    .where(eq(exports.id, exportId));
  if (!row) return null;
  const items = await db
    .select({
      assetId: exportItems.assetId,
      split: exportItems.split,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalName: assets.originalName,
      mediaMeta: assets.mediaMeta,
      annotationVersion: annotations.version,
      annotation: annotations.data,
    })
    .from(exportItems)
    .innerJoin(assets, eq(assets.id, exportItems.assetId))
    .innerJoin(annotations, eq(annotations.id, exportItems.annotationId))
    .where(eq(exportItems.exportId, exportId))
    .orderBy(exportItems.split, assets.createdAt);
  return { export: row, items };
}

export async function markExportRunning(db: Database, exportId: string): Promise<void> {
  await db
    .update(exports)
    .set({ status: "running", error: null })
    .where(and(eq(exports.id, exportId), inArray(exports.status, ["queued", "running", "failed"])));
}

export async function markExportReady(
  db: Database,
  exportId: string,
  result: { storageKey: string; byteSize: number; stats: Record<string, unknown> },
): Promise<void> {
  await db
    .update(exports)
    .set({ status: "ready", ...result, finishedAt: new Date() })
    .where(eq(exports.id, exportId));
}

export async function markExportFailed(db: Database, exportId: string, error: string): Promise<void> {
  await db
    .update(exports)
    .set({ status: "failed", error: error.slice(0, 1000), finishedAt: new Date() })
    .where(eq(exports.id, exportId));
}
