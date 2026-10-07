import { and, asc, count, eq, sql } from "drizzle-orm";
import { assets, auditEvents, projects } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { requireRole, type OrgScope } from "./scope.js";

type Modality = (typeof projects.$inferSelect)["modality"];

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  modality: Modality;
  taskType: string;
  createdAt: Date;
}

export interface ProjectWithCounts extends ProjectRow {
  assetCount: number;
  labelledCount: number;
}

const columns = {
  id: projects.id,
  name: projects.name,
  slug: projects.slug,
  description: projects.description,
  modality: projects.modality,
  taskType: projects.taskType,
  createdAt: projects.createdAt,
};

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if ("code" in e && e.code === "23505") return true;
  }
  return false;
}

/**
 * Creates a project. The caller validates `taskType` against the task-type registry
 * (`parseCreateProjectInput`); the database checks it matches the modality.
 */
export async function createProject(
  scope: OrgScope,
  input: { name: string; slug: string; description: string; modality: Modality; taskType: string },
): Promise<ProjectRow> {
  requireRole(scope, "manager");
  try {
    const [row] = await scope.db
      .insert(projects)
      .values({ ...input, orgId: scope.orgId })
      .returning(columns);
    if (!row) throw new Error("insert returned no row");
    await scope.db.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "project.created",
      resourceType: "project",
      resourceId: row.id,
      details: { name: row.name, taskType: row.taskType },
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AccessError("CONFLICT", "A project with that URL name already exists.");
    throw err;
  }
}

/** Projects of the scoped organisation with asset and labelled counts. */
export async function listProjects(scope: OrgScope): Promise<ProjectWithCounts[]> {
  const rows = await scope.db
    .select({
      ...columns,
      assetCount: count(assets.id),
      labelledCount: sql<number>`count(${assets.id}) filter (where ${assets.status} = 'approved')`.mapWith(
        Number,
      ),
    })
    .from(projects)
    .leftJoin(assets, eq(assets.projectId, projects.id))
    .where(eq(projects.orgId, scope.orgId))
    .groupBy(projects.id)
    .orderBy(asc(projects.createdAt));
  return rows;
}

/** One project of the scoped organisation, by slug; NOT_FOUND otherwise. */
export async function getProjectBySlug(scope: OrgScope, slug: string): Promise<ProjectRow> {
  const [row] = await scope.db
    .select(columns)
    .from(projects)
    .where(and(eq(projects.orgId, scope.orgId), eq(projects.slug, slug)));
  if (!row) throw new AccessError("NOT_FOUND", "Project not found.");
  return row;
}

/** One project of the scoped organisation, by id; NOT_FOUND otherwise. */
export async function getProjectById(scope: OrgScope, projectId: string): Promise<ProjectRow> {
  const [row] = await scope.db
    .select(columns)
    .from(projects)
    .where(and(eq(projects.orgId, scope.orgId), eq(projects.id, projectId)));
  if (!row) throw new AccessError("NOT_FOUND", "Project not found.");
  return row;
}
