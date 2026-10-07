import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { auditEvents, memberships, organizations, users } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { canAssignRole, requireRole, type OrgRole, type OrgScope } from "./scope.js";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

/** Postgres unique violation (23505), whether raw or wrapped by Drizzle in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    if ("code" in e && e.code === "23505") return true;
  }
  return false;
}

/** Creates an organisation; the creator becomes its owner. Slugs are unique across the install. */
export async function createOrganization(
  db: Database,
  userId: string,
  input: { name: string; slug: string },
): Promise<OrgSummary> {
  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.name, slug: input.slug })
        .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug });
      if (!org) throw new Error("insert returned no row");
      await tx.insert(memberships).values({ orgId: org.id, userId, role: "owner" });
      await tx.insert(auditEvents).values({
        orgId: org.id,
        actorUserId: userId,
        action: "organization.created",
        resourceType: "organization",
        resourceId: org.id,
        details: { name: org.name, slug: org.slug },
      });
      return { ...org, role: "owner" as const };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AccessError("CONFLICT", "That URL name is already taken.");
    throw err;
  }
}

/** Organisations the user belongs to, oldest membership first. */
export async function listMyOrganizations(db: Database, userId: string): Promise<OrgSummary[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: Date;
}

/** Members of the scoped organisation. Any member may see who else is in it. */
export async function listMembers(scope: OrgScope): Promise<MemberRow[]> {
  return scope.db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, scope.orgId))
    .orderBy(asc(memberships.createdAt));
}

async function ownerCount(scope: OrgScope): Promise<number> {
  const [row] = await scope.db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, scope.orgId), eq(memberships.role, "owner")));
  return row?.n ?? 0;
}

async function memberRole(scope: OrgScope, userId: string): Promise<OrgRole> {
  const [row] = await scope.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, scope.orgId), eq(memberships.userId, userId)));
  if (!row) throw new AccessError("NOT_FOUND", "That person isn't a member.");
  return row.role;
}

/** Changes a member's role. Admins and owners only; nobody grants above their own role; one owner always remains. */
export async function changeMemberRole(scope: OrgScope, userId: string, role: OrgRole): Promise<void> {
  requireRole(scope, "admin");
  const current = await memberRole(scope, userId);
  if (!canAssignRole(scope.role, role) || !canAssignRole(scope.role, current)) {
    throw new AccessError("FORBIDDEN", "You can't change a role above your own.");
  }
  if (current === "owner" && role !== "owner" && (await ownerCount(scope)) <= 1) {
    throw new AccessError("LAST_OWNER", "An organisation needs at least one owner.");
  }
  await scope.db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.orgId, scope.orgId), eq(memberships.userId, userId)));
  await scope.db.insert(auditEvents).values({
    orgId: scope.orgId,
    actorUserId: scope.userId,
    action: "membership.role_changed",
    resourceType: "membership",
    resourceId: userId,
    details: { from: current, to: role },
  });
}

/** Removes a member (or lets a member leave). The last owner can't be removed. */
export async function removeMember(scope: OrgScope, userId: string): Promise<void> {
  const leaving = userId === scope.userId;
  if (!leaving) requireRole(scope, "admin");
  const current = await memberRole(scope, userId);
  if (!leaving && !canAssignRole(scope.role, current)) {
    throw new AccessError("FORBIDDEN", "You can't remove someone with a higher role.");
  }
  if (current === "owner" && (await ownerCount(scope)) <= 1) {
    throw new AccessError("LAST_OWNER", "An organisation needs at least one owner.");
  }
  await scope.db
    .delete(memberships)
    .where(and(eq(memberships.orgId, scope.orgId), eq(memberships.userId, userId)));
  await scope.db.insert(auditEvents).values({
    orgId: scope.orgId,
    actorUserId: scope.userId,
    action: leaving ? "membership.left" : "membership.removed",
    resourceType: "membership",
    resourceId: userId,
    details: { role: current },
  });
}
