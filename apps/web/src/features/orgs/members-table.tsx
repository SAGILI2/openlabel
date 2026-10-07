"use client";
import { useState, useTransition } from "react";
import { LocalTime } from "@/components/time";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/features/auth";
import { changeRoleAction, removeMemberAction, revokeInvitationAction } from "@/server/orgs/actions";
import type { OrgRole } from "@openlabel/db";
import { ROLES, roleLabel } from "./roles";

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
}

export interface InvitationView {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

export function MembersTable({
  members,
  invitations,
  currentUserId,
  assignable,
  canRevokeInvites,
}: {
  members: MemberView[];
  invitations: InvitationView[];
  currentUserId: string;
  /** Roles the current user may grant to members; empty when they can't change roles. */
  assignable: OrgRole[];
  canRevokeInvites: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "That didn't work.");
    });
  }

  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <ul className="bg-card divide-y rounded-lg border" aria-busy={pending}>
        {members.map((m) => {
          const self = m.userId === currentUserId;
          const editable = !self && assignable.includes(m.role);
          return (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="size-8">
                <AvatarFallback className="bg-muted text-[12px] font-semibold">
                  {initials(m.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  {m.name}
                  {self && <Badge variant="secondary">You</Badge>}
                </p>
                <p className="text-muted-foreground truncate text-[12px]">
                  {m.email} · joined <LocalTime iso={m.joinedAt} />
                </p>
              </div>
              {editable ? (
                <Select
                  value={m.role}
                  disabled={pending}
                  onValueChange={(v) => {
                    run(() => changeRoleAction(m.userId, v));
                  }}
                >
                  <SelectTrigger className="h-8 w-[130px]" aria-label={`Role for ${m.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((r) => assignable.includes(r.value)).map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-muted-foreground w-[130px] text-[13px]">{roleLabel(m.role)}</span>
              )}
              {(editable || self) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    run(() => removeMemberAction(m.userId));
                  }}
                >
                  {self ? "Leave" : "Remove"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {invitations.length > 0 && (
        <section aria-labelledby="pending-heading" className="mt-4 grid gap-2">
          <h3 id="pending-heading" className="text-muted-foreground text-[13px] font-medium">
            Pending invitations
          </h3>
          <ul className="bg-card divide-y rounded-lg border">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-muted-foreground text-[12px]">
                    {roleLabel(i.role)} · expires <LocalTime iso={i.expiresAt} />
                  </p>
                </div>
                {canRevokeInvites && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      run(() => revokeInvitationAction(i.id));
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
