import { canAssignRole, listMembers, listPendingInvitations, type OrgRole } from "@openlabel/db";
import { TopBar } from "@/components/shell";
import { InviteForm, MembersTable, ROLES } from "@/features/orgs";
import { requireOrgScope } from "@/server/orgs";

export const metadata = { title: "Members" };

const MANAGE: OrgRole[] = ["owner", "admin"];
const INVITE: OrgRole[] = ["owner", "admin", "manager"];

export default async function MembersPage() {
  const { scope, org } = await requireOrgScope();
  const canInvite = INVITE.includes(scope.role);
  const [members, invitations] = await Promise.all([
    listMembers(scope),
    canInvite ? listPendingInvitations(scope) : Promise.resolve([]),
  ]);
  const assignable = ROLES.map((r) => r.value).filter((r) => canAssignRole(scope.role, r));

  return (
    <>
      <TopBar title="Members" />
      <div className="mx-auto grid w-full max-w-[880px] gap-8 px-6 py-8">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">{org.name}</h2>
          <p className="text-muted-foreground mt-1">
            {members.length} {members.length === 1 ? "member" : "members"}. Only members can see this
            organisation&apos;s projects and data.
          </p>
        </div>
        {canInvite && (
          <section aria-labelledby="invite-heading" className="bg-card rounded-lg border p-5">
            <h3 id="invite-heading" className="mb-4 font-semibold">
              Invite people
            </h3>
            <InviteForm assignable={assignable} />
          </section>
        )}
        <MembersTable
          members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt.toISOString(),
          }))}
          currentUserId={scope.userId}
          assignable={MANAGE.includes(scope.role) ? assignable : []}
          canRevokeInvites={canInvite}
        />
      </div>
    </>
  );
}
