import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client/index.js";
import { auditEvents, invitations, memberships, organizations, users } from "../schema/index.js";
import { AccessError } from "./errors.js";
import { queueEmail } from "./mail.js";
import { canAssignRole, requireRole, type OrgRole, type OrgScope } from "./scope.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: Date;
  /** Raw token; shown once to build the invite link and never stored. */
  token: string;
}

/**
 * Invites someone by email. Managers and above can invite, never above their own role.
 * Re-inviting an email revokes its earlier pending invitation.
 */
export async function createInvitation(
  scope: OrgScope,
  input: { email: string; role: OrgRole },
  now = new Date(),
): Promise<CreatedInvitation> {
  requireRole(scope, "manager");
  if (!canAssignRole(scope.role, input.role)) {
    throw new AccessError("FORBIDDEN", "You can't invite someone with a role above your own.");
  }
  const email = input.email.trim().toLowerCase();
  const [existing] = await scope.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.email, email), eq(memberships.orgId, scope.orgId)));
  if (existing) throw new AccessError("CONFLICT", "That person is already a member.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  return scope.db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.orgId, scope.orgId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({
        orgId: scope.orgId,
        email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedByUserId: scope.userId,
        expiresAt,
      })
      .returning({ id: invitations.id });
    if (!row) throw new Error("insert returned no row");
    await tx.insert(auditEvents).values({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: row.id,
      details: { email, role: input.role },
    });
    const [context] = await tx
      .select({ orgName: organizations.name, inviterName: users.name })
      .from(organizations)
      .innerJoin(users, eq(users.id, scope.userId))
      .where(eq(organizations.id, scope.orgId));
    await queueEmail(tx, {
      orgId: scope.orgId,
      to: email,
      template: "invitation",
      props: {
        orgName: context?.orgName ?? "OpenLabel",
        inviterName: context?.inviterName ?? "A teammate",
        role: input.role,
        path: `/invite/${token}`,
        expiresAt: expiresAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
      },
    });
    return { id: row.id, email, role: input.role, expiresAt, token };
  });
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: Date;
  createdAt: Date;
}

/** Open invitations for the scoped organisation. */
export async function listPendingInvitations(
  scope: OrgScope,
  now = new Date(),
): Promise<PendingInvitation[]> {
  requireRole(scope, "manager");
  return scope.db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, scope.orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

/** Cancels a pending invitation in the scoped organisation. */
export async function revokeInvitation(
  scope: OrgScope,
  invitationId: string,
  now = new Date(),
): Promise<void> {
  requireRole(scope, "manager");
  const updated = await scope.db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.orgId, scope.orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  if (updated.length === 0) throw new AccessError("NOT_FOUND", "That invitation isn't pending.");
  await scope.db.insert(auditEvents).values({
    orgId: scope.orgId,
    actorUserId: scope.userId,
    action: "invitation.revoked",
    resourceType: "invitation",
    resourceId: invitationId,
  });
}

export interface InvitationPreview {
  orgName: string;
  email: string;
  role: OrgRole;
}

async function findOpenInvitation(db: Database, token: string, now: Date) {
  const [row] = await db
    .select({
      id: invitations.id,
      orgId: invitations.orgId,
      orgName: organizations.name,
      email: invitations.email,
      role: invitations.role,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    );
  return row;
}

/** What an invite link is for, without accepting it. Null when invalid, used or expired. */
export async function previewInvitation(
  db: Database,
  token: string,
  now = new Date(),
): Promise<InvitationPreview | null> {
  const row = await findOpenInvitation(db, token, now);
  return row ? { orgName: row.orgName, email: row.email, role: row.role } : null;
}

/**
 * Accepts an invitation for the signed-in user. The user's email must match the invited
 * email, so a forwarded link can't be used by someone else.
 */
export async function acceptInvitation(
  db: Database,
  user: { id: string; email: string },
  token: string,
  now = new Date(),
): Promise<{ orgId: string; role: OrgRole }> {
  const invite = await findOpenInvitation(db, token, now);
  if (!invite) throw new AccessError("INVITATION_INVALID", "This invitation is invalid or has expired.");
  if (invite.email !== user.email.trim().toLowerCase()) {
    throw new AccessError("INVITATION_INVALID", `This invitation was sent to ${invite.email}.`);
  }
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(invitations)
      .set({ acceptedAt: now })
      .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (claimed.length === 0)
      throw new AccessError("INVITATION_INVALID", "This invitation was already used.");
    await tx
      .insert(memberships)
      .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx.insert(auditEvents).values({
      orgId: invite.orgId,
      actorUserId: user.id,
      action: "invitation.accepted",
      resourceType: "invitation",
      resourceId: invite.id,
      details: { role: invite.role },
    });
    return { orgId: invite.orgId, role: invite.role };
  });
}
