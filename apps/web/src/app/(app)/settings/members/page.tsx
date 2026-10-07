import {
  canAssignRole,
  listMembers,
  listPendingInvitations,
  listRecentAudit,
  type OrgRole,
} from "@openlabel/db";
import { PageBody, TopBar } from "@/components/shell";
import { SettingsNav } from "@/features/settings";
import { ActivityList, InvitationsTable, InviteDialog, MembersTable, ROLES } from "@/features/orgs";
import { requireOrgScope } from "@/server/orgs";

export const metadata = { title: "Members" };

const MANAGE: OrgRole[] = ["owner", "admin"];
const INVITE: OrgRole[] = ["owner", "admin", "manager"];

export default async function MembersPage() {
  const { scope, org } = await requireOrgScope();
  const canInvite = INVITE.includes(scope.role);
  const [members, invitations, activity] = await Promise.all([
    listMembers(scope),
    canInvite ? listPendingInvitations(scope) : Promise.resolve([]),
    canInvite ? listRecentAudit(scope, 15) : Promise.resolve([]),
  ]);
  const assignable = ROLES.map((r) => r.value).filter((r) => canAssignRole(scope.role, r));

  return (
    <>
      <TopBar title="Members" />
      <SettingsNav variant="tabs" />
      <PageBody className="max-w-none">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">
              Members <span className="text-muted-foreground font-normal">({members.length})</span>
            </h2>
            <p className="text-muted-foreground mt-1">
              People in {org.name}. Only members can see its projects and data.
            </p>
          </div>
          {canInvite && <InviteDialog assignable={assignable} orgName={org.name} />}
        </div>
        <MembersTable
          members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
          currentUserId={scope.userId}
          assignable={MANAGE.includes(scope.role) ? assignable : []}
        />
        <InvitationsTable
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt.toISOString(),
          }))}
          canRevoke={canInvite}
        />
        {canInvite && (
          <ActivityList
            events={activity.map((e) => ({
              id: e.id,
              action: e.action,
              actorName: e.actorName,
              details: e.details,
              occurredAt: e.occurredAt.toISOString(),
            }))}
          />
        )}
      </PageBody>
    </>
  );
}
