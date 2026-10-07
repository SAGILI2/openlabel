import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { listMyOrganizations, resolveOrgScope, type OrgScope, type OrgSummary } from "@openlabel/db";
import { requireSession } from "../auth";
import { getDb } from "../db";

export interface OrgContext {
  session: Awaited<ReturnType<typeof requireSession>>;
  orgs: OrgSummary[];
  /** The organisation the user is working in, or null if they don't belong to any yet. */
  active: OrgSummary | null;
}

/**
 * Signed-in user, their organisations and the active one, once per request. The session's
 * stored choice is honoured only while the user is still a member; otherwise the first
 * membership is used.
 */
export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const session = await requireSession();
  const orgs = await listMyOrganizations(getDb().db, session.user.id);
  const stored = (session.session as { activeOrgId?: string | null }).activeOrgId ?? null;
  const active = orgs.find((o) => o.id === stored) ?? orgs[0] ?? null;
  return { session, orgs, active };
});

/** Scope for the active organisation; sends users without one to create it. */
export async function requireOrgScope(): Promise<{ scope: OrgScope; org: OrgSummary }> {
  const { session, active } = await getOrgContext();
  if (!active) redirect("/onboarding");
  const scope = await resolveOrgScope(getDb().db, session.user.id, active.id);
  return { scope, org: active };
}
