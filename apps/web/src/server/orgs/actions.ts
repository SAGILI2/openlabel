"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AccessError,
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  removeMember,
  revokeInvitation,
  setActiveOrganization,
} from "@openlabel/db";
import { requireSession } from "../auth";
import { getDb } from "../db";
import { getConfig } from "../env";
import { requireOrgScope } from "./context";

/** Result for forms: an error message, or data on success. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const roleSchema = z.enum(["owner", "admin", "manager", "labeller", "reviewer", "viewer"]);
const slugSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof AccessError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the form." };
  throw err;
}

/** Creates an organisation, makes it active and opens the overview. */
export async function createOrganizationAction(input: { name: string; slug: string }): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const parsed = z
      .object({ name: z.string().trim().min(1, "Enter a name.").max(120), slug: slugSchema })
      .parse(input);
    const org = await createOrganization(getDb().db, session.user.id, parsed);
    await setActiveOrganization(getDb().db, session.user, session.session.token, org.id);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

/** Switches the active organisation (membership re-checked). */
export async function switchOrganizationAction(orgId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setActiveOrganization(getDb().db, session.user, session.session.token, z.uuid().parse(orgId));
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true, data: undefined };
}

/** Invites someone; returns the one-time link to share (email delivery arrives with notifications). */
export async function inviteMemberAction(input: {
  email: string;
  role: string;
}): Promise<ActionResult<{ link: string; email: string }>> {
  try {
    const { scope } = await requireOrgScope();
    const parsed = z
      .object({ email: z.email("Enter a valid email address."), role: roleSchema })
      .parse(input);
    const invite = await createInvitation(scope, parsed);
    const origin = getConfig().APP_URL.replace(/\/$/, "");
    refresh();
    return { ok: true, data: { link: `${origin}/invite/${invite.token}`, email: invite.email } };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await revokeInvitation(scope, z.uuid().parse(invitationId));
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await changeMemberRole(scope, z.uuid().parse(userId), roleSchema.parse(role));
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    const { scope } = await requireOrgScope();
    await removeMember(scope, z.uuid().parse(userId));
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Accepts an invitation for the signed-in user and switches to that organisation. */
export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { orgId } = await acceptInvitation(getDb().db, session.user, z.string().min(16).parse(token));
    await setActiveOrganization(getDb().db, session.user, session.session.token, orgId);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}
