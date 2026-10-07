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

/** Shared column template so the header, member and invitation rows line up. */
const ROW = "grid items-center gap-x-4 px-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_150px_120px_88px]";

function useRunner() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "That didn't work.");
    });
  }
  return { error, pending, run };
}

function RoleControl({
  role,
  editable,
  assignable,
  disabled,
  label,
  onChange,
}: {
  role: OrgRole;
  editable: boolean;
  assignable: OrgRole[];
  disabled: boolean;
  label: string;
  onChange: (role: string) => void;
}) {
  if (!editable) return <span className="text-[13px]">{roleLabel(role)}</span>;
  return (
    <Select value={role} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px]" aria-label={label}>
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
  );
}

/** Members as a table from 1024px; stacked rows on tablets and phones. */
export function MembersTable({
  members,
  currentUserId,
  assignable,
}: {
  members: MemberView[];
  currentUserId: string;
  /** Roles the current user may grant to members; empty when they can't change roles. */
  assignable: OrgRole[];
}) {
  const { error, pending, run } = useRunner();
  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <div className="bg-card overflow-hidden rounded-lg border" role="table" aria-busy={pending}>
        <div
          role="row"
          className={`${ROW} text-muted-foreground bg-muted/50 hidden h-10 border-b text-[12px] font-medium lg:grid`}
        >
          <span role="columnheader">Name</span>
          <span role="columnheader">Email</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Joined</span>
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>
        {members.map((m) => {
          const self = m.userId === currentUserId;
          const editable = !self && assignable.includes(m.role);
          return (
            <div
              key={m.userId}
              role="row"
              className={`${ROW} grid-cols-[minmax(0,1fr)_auto] gap-y-2 border-b py-3 last:border-b-0`}
            >
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-muted text-[12px] font-semibold">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{m.name}</span>
                    {self && <Badge variant="secondary">You</Badge>}
                  </p>
                  <p className="text-muted-foreground truncate text-[12px] lg:hidden">{m.email}</p>
                </div>
              </div>
              <span role="cell" className="text-muted-foreground hidden truncate text-[13px] lg:block">
                {m.email}
              </span>
              <div role="cell" className="justify-self-end lg:justify-self-start">
                <RoleControl
                  role={m.role}
                  editable={editable}
                  assignable={assignable}
                  disabled={pending}
                  label={`Role for ${m.name}`}
                  onChange={(v) => {
                    run(() => changeRoleAction(m.userId, v));
                  }}
                />
              </div>
              <span role="cell" className="text-muted-foreground hidden text-[13px] tabular-nums lg:block">
                <LocalTime iso={m.joinedAt} format="date" />
              </span>
              <div role="cell" className="col-span-2 lg:col-span-1 lg:justify-self-end">
                {(editable || self) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive -ml-2 lg:ml-0"
                    disabled={pending}
                    onClick={() => {
                      run(() => removeMemberAction(m.userId));
                    }}
                  >
                    {self ? "Leave" : "Remove"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pending invitations, in the same column layout as the members table. */
export function InvitationsTable({
  invitations,
  canRevoke,
}: {
  invitations: InvitationView[];
  canRevoke: boolean;
}) {
  const { error, pending, run } = useRunner();
  if (invitations.length === 0) return null;
  return (
    <section aria-labelledby="pending-heading" className="grid gap-3">
      <h3 id="pending-heading" className="font-semibold">
        Pending invitations <span className="text-muted-foreground font-normal">({invitations.length})</span>
      </h3>
      <FormError message={error} />
      <div className="bg-card overflow-hidden rounded-lg border" role="table" aria-busy={pending}>
        {invitations.map((i) => (
          <div
            key={i.id}
            role="row"
            className={`${ROW} grid-cols-[minmax(0,1fr)_auto] gap-y-1 border-b py-3 last:border-b-0`}
          >
            <span role="cell" className="truncate font-medium lg:col-span-2">
              {i.email}
            </span>
            <span role="cell" className="justify-self-end text-[13px] md:justify-self-start">
              {roleLabel(i.role)}
            </span>
            <span role="cell" className="text-muted-foreground text-[13px]">
              Expires <LocalTime iso={i.expiresAt} format="date" />
            </span>
            <div role="cell" className="justify-self-end">
              {canRevoke && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={pending}
                  onClick={() => {
                    run(() => revokeInvitationAction(i.id));
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
