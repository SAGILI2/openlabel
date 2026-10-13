import { and, asc, count, eq, sql } from "drizzle-orm";
import { annotations, assets, auditEvents, projects } from "../schema/index.js";
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
  /** Classes for whole-asset tasks, in display order. */
  classes: ProjectClass[];
  multiLabel: boolean;
  createdAt: Date;
}

/** A class as submitted from a form: existing ones carry their key, new ones only a name. */
export interface ClassInput {
  key?: string | undefined;
  name: string;
}

export interface ProjectClass {
  /** Stored in annotations; stable once used. */
  key: string;
  /** Shown to people. */
  name: string;
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
  classes: projects.classes,
  multiLabel: projects.multiLabel,
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
  input: {
    name: string;
    slug: string;
    description: string;
    modality: Modality;
    taskType: string;
    classes?: ClassInput[];
    multiLabel?: boolean;
  },
): Promise<ProjectRow> {
  requireRole(scope, "manager");
  try {
    const [row] = await scope.db
      .insert(projects)
      .values({ ...input, classes: cleanClasses(input.classes ?? []), orgId: scope.orgId })
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

/** Trims names, derives keys, drops blanks and duplicates. Keys are lowercase slugs of the name. */
export function cleanClasses(classes: ClassInput[]): ProjectClass[] {
  const out: ProjectClass[] = [];
  const seen = new Set<string>();
  for (const c of classes) {
    const name = c.name.trim().slice(0, 80);
    const key = (c.key?.trim() || name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name });
  }
  if (out.length > 200) throw new AccessError("CONFLICT", "Use 200 classes or fewer.");
  return out;
}

/**
 * Replaces a project's class list. Existing keys keep their meaning (renaming changes only the
 * name); a key already used in saved labels can't be removed, so labels never point at nothing.
 */
export async function setProjectClasses(
  scope: OrgScope,
  projectId: string,
  input: { classes: ClassInput[]; multiLabel: boolean },
): Promise<ProjectRow> {
  requireRole(scope, "manager");
  const project = await getProjectById(scope, projectId);
  const classes = cleanClasses(input.classes);
  const kept = new Set(classes.map((c) => c.key));
  const removed = project.classes.filter((c) => !kept.has(c.key)).map((c) => c.key);
  if (removed.length > 0) {
    const used = await scope.db.execute<{ key: string }>(sql`
      select distinct l.key from ${annotations} an
      join ${assets} a on a.id = an.asset_id,
      jsonb_array_elements_text(an.data -> 'labels') as l(key)
      where a.project_id = ${projectId} and a.org_id = ${scope.orgId}
        and l.key in (${sql.join(
          removed.map((k) => sql`${k}`),
          sql`, `,
        )})`);
    if (used.length > 0) {
      const names = used.map((u) => project.classes.find((c) => c.key === u.key)?.name ?? u.key);
      throw new AccessError(
        "CONFLICT",
        `${names.join(", ")} ${names.length === 1 ? "is" : "are"} already used in labels. Rename instead of removing.`,
      );
    }
  }
  if (classes.length === 0 && project.taskType.endsWith(".classification")) {
    throw new AccessError("CONFLICT", "Add at least one class.");
  }
  const [row] = await scope.db
    .update(projects)
    .set({ classes, multiLabel: input.multiLabel })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, scope.orgId)))
    .returning(columns);
  if (!row) throw new AccessError("NOT_FOUND", "Project not found.");
  await scope.db.insert(auditEvents).values({
    orgId: scope.orgId,
    actorUserId: scope.userId,
    action: "project.classes_changed",
    resourceType: "project",
    resourceId: projectId,
    details: { classes: classes.map((c) => c.key), multiLabel: input.multiLabel },
  });
  return row;
}
