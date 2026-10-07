import { and, eq } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { memberships, organizations } from "../schema/index.js";
import { AccessError } from "./errors.js";

export type OrgRole = (typeof memberships.$inferSelect)["role"];

/**
 * Proof that a user belongs to an organisation, with their role. Every org-owned query takes
 * one of these instead of a raw org id, so data can't be read across organisations by mistake:
 * the only way to get a scope is {@link resolveOrgScope}, which checks the membership.
 */
export interface OrgScope {
  readonly orgId: string;
  readonly userId: string;
  readonly role: OrgRole;
  readonly db: Database;
}

/** Loads the caller's membership in `orgId`; throws NOT_A_MEMBER if there is none. */
export async function resolveOrgScope(db: Database, userId: string, orgId: string): Promise<OrgScope> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  if (!row) throw new AccessError("NOT_A_MEMBER", "You are not a member of this organisation.");
  return { orgId, userId, role: row.role, db };
}

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  labeller: 1,
  reviewer: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

/**
 * Coarse org-level guard used by this layer. Fine-grained permissions (`can(user, action,
 * resource)`, per-project overrides) arrive with OL-10 and will replace these call sites.
 */
export function requireRole(scope: OrgScope, minimum: OrgRole): void {
  if (ROLE_RANK[scope.role] < ROLE_RANK[minimum]) {
    throw new AccessError("FORBIDDEN", `This needs the ${minimum} role or higher.`);
  }
}

/** Whether `actor` may grant or change `target` (nobody can hand out a role above their own). */
export function canAssignRole(actor: OrgRole, target: OrgRole): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}
