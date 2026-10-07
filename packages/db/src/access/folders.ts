import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { assets, folders, projects } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { requireRole, type OrgScope } from "./scope.js";

export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
}

export interface FolderNode extends FolderRow {
  /** Files directly in this folder. */
  fileCount: number;
  /** Files in this folder and all sub-folders. */
  totalCount: number;
  /** Labelled (submitted/approved) files in this folder and all sub-folders. */
  labelledCount: number;
  children: FolderNode[];
}

const columns = { id: folders.id, parentId: folders.parentId, name: folders.name, path: folders.path };

/** Trims, collapses spaces and rejects names that would break paths. */
export function cleanFolderName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (
    !name ||
    name.length > 120 ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    throw new AccessError("CONFLICT", "Use a folder name without slashes, up to 120 characters.");
  }
  return name;
}

async function projectInScope(scope: OrgScope, projectId: string): Promise<void> {
  const [row] = await scope.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Project not found.");
}

async function folderInScope(scope: OrgScope, projectId: string, folderId: string): Promise<FolderRow> {
  const [row] = await scope.db
    .select(columns)
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.projectId, projectId), eq(folders.orgId, scope.orgId)));
  if (!row) throw new AccessError("NOT_FOUND", "Folder not found.");
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if ("code" in e && e.code === "23505") return true;
  }
  return false;
}

/** Creates a folder under `parentId` (null = project root). */
export async function createFolder(
  scope: OrgScope,
  projectId: string,
  parentId: string | null,
  rawName: string,
): Promise<FolderRow> {
  requireRole(scope, "manager");
  await projectInScope(scope, projectId);
  const name = cleanFolderName(rawName);
  const parent = parentId ? await folderInScope(scope, projectId, parentId) : null;
  const path = parent ? `${parent.path}/${name}` : name;
  try {
    const [row] = await scope.db
      .insert(folders)
      .values({ orgId: scope.orgId, projectId, parentId: parent?.id ?? null, name, path })
      .returning(columns);
    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AccessError("CONFLICT", `A folder named "${name}" already exists here.`);
    throw err;
  }
}

/**
 * Returns the folder at `path` (e.g. `2026-07/CA`), creating any missing levels. Used when a
 * folder is uploaded from the user's computer. Concurrent uploads creating the same folder are safe.
 */
export async function ensureFolderPath(
  scope: OrgScope,
  projectId: string,
  path: string,
): Promise<FolderRow | null> {
  requireRole(scope, "manager");
  await projectInScope(scope, projectId);
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(cleanFolderName);
  let parent: FolderRow | null = null;
  for (const name of parts) {
    const full: string = parent ? `${parent.path}/${name}` : name;
    await scope.db
      .insert(folders)
      .values({ orgId: scope.orgId, projectId, parentId: parent?.id ?? null, name, path: full })
      .onConflictDoNothing({ target: [folders.projectId, folders.path] });
    const [row] = await scope.db
      .select(columns)
      .from(folders)
      .where(and(eq(folders.projectId, projectId), eq(folders.path, full)));
    if (!row) throw new Error(`folder ${full} vanished`);
    parent = row;
  }
  return parent;
}

/** Renames a folder and rewrites the paths of everything below it. */
export async function renameFolder(
  scope: OrgScope,
  projectId: string,
  folderId: string,
  rawName: string,
): Promise<FolderRow> {
  requireRole(scope, "manager");
  const folder = await folderInScope(scope, projectId, folderId);
  const name = cleanFolderName(rawName);
  const slash = folder.path.lastIndexOf("/");
  const newPath = slash === -1 ? name : `${folder.path.slice(0, slash)}/${name}`;
  if (newPath === folder.path) return folder;
  try {
    return await scope.db.transaction(async (tx) => {
      await tx
        .update(folders)
        .set({ path: sql`${newPath} || substr(${folders.path}, ${folder.path.length + 1})` })
        .where(and(eq(folders.projectId, projectId), like(folders.path, `${folder.path}/%`)));
      const [row] = await tx
        .update(folders)
        .set({ name, path: newPath })
        .where(eq(folders.id, folderId))
        .returning(columns);
      if (!row) throw new Error("folder vanished");
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AccessError("CONFLICT", `A folder named "${name}" already exists here.`);
    throw err;
  }
}

/** Deletes a folder only when it and its sub-folders hold no files. */
export async function deleteFolder(scope: OrgScope, projectId: string, folderId: string): Promise<void> {
  requireRole(scope, "manager");
  const folder = await folderInScope(scope, projectId, folderId);
  const subtree = await scope.db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.projectId, projectId),
        or(eq(folders.id, folderId), like(folders.path, `${folder.path}/%`)),
      ),
    );
  const [row] = await scope.db
    .select({ n: count() })
    .from(assets)
    .where(
      inArray(
        assets.folderId,
        subtree.map((f) => f.id),
      ),
    );
  if ((row?.n ?? 0) > 0) throw new AccessError("CONFLICT", "Move or delete the files in this folder first.");
  await scope.db.delete(folders).where(eq(folders.id, folderId));
}

/** Moves files (by id) into a folder, or to the project root when `folderId` is null. */
export async function moveAssets(
  scope: OrgScope,
  projectId: string,
  assetIds: string[],
  folderId: string | null,
): Promise<number> {
  requireRole(scope, "manager");
  await projectInScope(scope, projectId);
  if (folderId) await folderInScope(scope, projectId, folderId);
  if (assetIds.length === 0) return 0;
  const moved = await scope.db
    .update(assets)
    .set({ folderId })
    .where(and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId), inArray(assets.id, assetIds)))
    .returning({ id: assets.id });
  return moved.length;
}

/** The project's folder tree with file counts, children sorted by name. */
export async function folderTree(
  scope: OrgScope,
  projectId: string,
): Promise<{ roots: FolderNode[]; rootFileCount: number; totalCount: number; labelledCount: number }> {
  await projectInScope(scope, projectId);
  const [rows, counts] = await Promise.all([
    scope.db
      .select(columns)
      .from(folders)
      .where(and(eq(folders.projectId, projectId), eq(folders.orgId, scope.orgId)))
      .orderBy(asc(folders.path)),
    scope.db
      .select({
        folderId: assets.folderId,
        n: count(),
        labelled: sql<number>`count(*) filter (where ${assets.status} in ('submitted', 'approved'))`.mapWith(
          Number,
        ),
      })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.orgId, scope.orgId)))
      .groupBy(assets.folderId),
  ]);
  const direct = new Map(counts.map((c) => [c.folderId, c]));
  const nodes = new Map<string, FolderNode>(
    rows.map((r) => [
      r.id,
      {
        ...r,
        fileCount: direct.get(r.id)?.n ?? 0,
        totalCount: direct.get(r.id)?.n ?? 0,
        labelledCount: direct.get(r.id)?.labelled ?? 0,
        children: [],
      },
    ]),
  );
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sum = (n: FolderNode): [number, number] => {
    for (const c of n.children) {
      const [t, l] = sum(c);
      n.totalCount += t;
      n.labelledCount += l;
    }
    n.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return [n.totalCount, n.labelledCount];
  };
  roots.forEach(sum);
  roots.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const root = direct.get(null);
  const all = counts.reduce((a, c) => a + c.n, 0);
  const labelled = counts.reduce((a, c) => a + c.labelled, 0);
  return { roots, rootFileCount: root?.n ?? 0, totalCount: all, labelledCount: labelled };
}

/** Ids of a folder and all its sub-folders (for "this folder and below" listings and exports). */
export async function subtreeFolderIds(
  scope: OrgScope,
  projectId: string,
  folderId: string,
): Promise<string[]> {
  const folder = await folderInScope(scope, projectId, folderId);
  const rows = await scope.db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.projectId, projectId),
        or(eq(folders.id, folderId), like(folders.path, `${folder.path}/%`)),
      ),
    );
  return rows.map((r) => r.id);
}
