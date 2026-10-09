import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
  annotations,
  assets,
  auditEvents,
  folders,
  predictions,
  projects,
  reviewRequests,
} from "../schema/index.js";
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

/** File-browser filters, as the database sees them. */
export type AssetFilter = "all" | "mine" | "todo" | "review" | "done" | "ocr" | "notext";

/** Files whose latest OCR read of some page found no words (often a page turned the wrong way). */
const noText = sql`exists (
  select 1 from (
    select distinct on (p.page) p.words from ${predictions} p
    where p.asset_id = ${assets.id} order by p.page, p.created_at desc
  ) latest where latest.words = 0
)`;

const FILTER_STATUSES: Record<Exclude<AssetFilter, "all" | "mine" | "notext">, AssetStatus[]> = {
  todo: ["prelabelled", "in_progress", "rejected"],
  review: ["submitted"],
  done: ["approved"],
  ocr: ["new", "prelabelling"],
};

export type AssetSort = "oldest" | "newest" | "name" | "name-desc";

const SORTS: Record<AssetSort, SQL[]> = {
  oldest: [asc(assets.createdAt), asc(assets.id)],
  newest: [desc(assets.createdAt), desc(assets.id)],
  name: [asc(assets.originalName), asc(assets.id)],
  "name-desc": [desc(assets.originalName), desc(assets.id)],
};

export interface AssetPage {
  rows: (AssetRow & { folderPath: string | null })[];
  /** Files matching the filter (all pages). */
  total: number;
  /** Counts per filter for the tabs, within the same folder scope. */
  counts: Record<AssetFilter, number>;
}

function folderCondition(folders: string[] | null | undefined) {
  if (folders === undefined) return sql`true`;
  if (folders === null) return sql`${assets.folderId} is null`;
  if (folders.length === 0) return sql`false`;
  return inArray(assets.folderId, folders);
}

/**
 * One page of a project's files for the browser, filtered and counted in the database so
 * projects with tens of thousands of files stay fast. `folders` works as in {@link listAssets}.
 */
export async function pageAssets(
  scope: OrgScope,
  projectId: string,
  opts: {
    folders?: string[] | null | undefined;
    filter: AssetFilter;
    page: number;
    pageSize: number;
    /** Case-insensitive part of the file name. */
    search?: string | undefined;
    sort?: AssetSort | undefined;
  },
): Promise<AssetPage> {
  await projectInScope(scope, projectId);
  const term = opts.search?.trim().slice(0, 200);
  const base = and(
    eq(assets.projectId, projectId),
    eq(assets.orgId, scope.orgId),
    folderCondition(opts.folders),
    // Escape LIKE wildcards so a search for "50%" means the text "50%".
    term ? sql`${assets.originalName} ilike ${`%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}` : undefined,
  );
  const mine = sql`(${assets.status} = 'submitted' and exists (select 1 from ${reviewRequests} rr
    where rr.asset_id = ${assets.id} and rr.reviewer_user_id = ${scope.userId}))`;
  const inStatuses = (key: Exclude<AssetFilter, "all" | "mine" | "notext">) =>
    inArray(assets.status, FILTER_STATUSES[key]);
  const filterSql =
    opts.filter === "all"
      ? sql`true`
      : opts.filter === "mine"
        ? mine
        : opts.filter === "notext"
          ? noText
          : inStatuses(opts.filter);

  const [countRow] = await scope.db
    .select({
      all: sql<number>`count(*)::int`,
      mine: sql<number>`(count(*) filter (where ${mine}))::int`,
      todo: sql<number>`(count(*) filter (where ${inStatuses("todo")}))::int`,
      review: sql<number>`(count(*) filter (where ${inStatuses("review")}))::int`,
      done: sql<number>`(count(*) filter (where ${inStatuses("done")}))::int`,
      ocr: sql<number>`(count(*) filter (where ${inStatuses("ocr")}))::int`,
      notext: sql<number>`(count(*) filter (where ${noText}))::int`,
    })
    .from(assets)
    .where(base);
  const counts = countRow ?? { all: 0, mine: 0, todo: 0, review: 0, done: 0, ocr: 0, notext: 0 };
  const size = Math.min(Math.max(opts.pageSize, 1), 500);
  const rows = await scope.db
    .select({ ...columns, folderPath: folders.path })
    .from(assets)
    .leftJoin(folders, eq(folders.id, assets.folderId))
    .where(and(base, filterSql))
    .orderBy(...SORTS[opts.sort ?? "oldest"])
    .limit(size)
    .offset(Math.max(opts.page - 1, 0) * size);
  return { rows, total: counts[opts.filter], counts };
}

/**
 * Files around one file, for the labelling screen's prev/next and film-strip, without loading
 * the whole project. Same order as the browser.
 */
export async function assetNeighbours(
  scope: OrgScope,
  projectId: string,
  assetId: string,
  folders: string[] | null | undefined,
  radius = 40,
): Promise<{ rows: AssetRow[]; index: number; position: number; total: number }> {
  const target = await getAsset(scope, assetId);
  const base = and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId), folderCondition(folders));
  const before = sql`(${assets.createdAt}, ${assets.id}) < (${target.createdAt.toISOString()}::timestamptz, ${target.id}::uuid)`;
  const [pos] = await scope.db
    .select({
      before: sql<number>`(count(*) filter (where ${before}))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(assets)
    .where(base);
  const index = pos?.before ?? 0;
  const start = Math.max(index - radius, 0);
  const rows = await scope.db
    .select(columns)
    .from(assets)
    .where(base)
    .orderBy(asc(assets.createdAt), asc(assets.id))
    .limit(radius * 2 + 1)
    .offset(start);
  // index: within `rows`; position: within the whole folder.
  return { rows, index: index - start, position: index, total: pos?.total ?? rows.length };
}

/**
 * Deletes files with their predictions, labels, reviews and export membership (cascades), and
 * returns the storage keys no other file still uses, for the caller to remove from storage.
 */
export async function deleteAssets(
  scope: OrgScope,
  projectId: string,
  assetIds: string[],
): Promise<{ deleted: number; orphanKeys: string[] }> {
  requireRole(scope, "manager");
  await projectInScope(scope, projectId);
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return { deleted: 0, orphanKeys: [] };
  return scope.db.transaction(async (tx) => {
    const gone: { id: string; storageKey: string }[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      gone.push(
        ...(await tx
          .delete(assets)
          .where(
            and(
              eq(assets.projectId, projectId),
              eq(assets.orgId, scope.orgId),
              inArray(assets.id, ids.slice(i, i + 1000)),
            ),
          )
          .returning({ id: assets.id, storageKey: assets.storageKey })),
      );
    }
    const keys = [...new Set(gone.map((g) => g.storageKey))];
    // The same bytes may be uploaded to another project; keep the object while anything uses it.
    const used = new Set<string>();
    for (let i = 0; i < keys.length; i += 1000) {
      const still = await tx
        .select({ storageKey: assets.storageKey })
        .from(assets)
        .where(inArray(assets.storageKey, keys.slice(i, i + 1000)));
      for (const s of still) used.add(s.storageKey);
    }
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "assets.deleted",
      resourceType: "project",
      resourceId: projectId,
      details: { count: gone.length },
    });
    return { deleted: gone.length, orphanKeys: keys.filter((k) => !used.has(k)) };
  });
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
  /** Latest prediction of each page of a multi-page document (PDF), by page number. */
  pagePredictions: Map<number, Record<string, unknown>>;
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
    .where(and(eq(predictions.assetId, assetId), eq(predictions.orgId, scope.orgId), eq(predictions.page, 1)))
    .orderBy(desc(predictions.createdAt))
    .limit(1);
  const pageRows =
    asset.kind === "pdf"
      ? await scope.db
          .selectDistinctOn([predictions.page], { page: predictions.page, result: predictions.result })
          .from(predictions)
          .where(and(eq(predictions.assetId, assetId), eq(predictions.orgId, scope.orgId)))
          .orderBy(predictions.page, desc(predictions.createdAt))
      : [];
  const [annotation] = await scope.db
    .select({ version: annotations.version, data: annotations.data, createdAt: annotations.createdAt })
    .from(annotations)
    .where(and(eq(annotations.assetId, assetId), eq(annotations.orgId, scope.orgId)))
    .orderBy(desc(annotations.version))
    .limit(1);
  return {
    asset,
    prediction: prediction ?? null,
    annotation: annotation ?? null,
    pagePredictions: new Map(pageRows.map((r) => [r.page, r.result])),
  };
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
