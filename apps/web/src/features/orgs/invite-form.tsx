"use client";
import { Check, Copy, Link2 } from "lucide-react";
import { useState, useTransition, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError } from "@/features/auth";
import { inviteMemberAction } from "@/server/orgs/actions";
import type { OrgRole } from "@openlabel/db";
import { ROLES } from "./roles";

/** Invite by email with a role; shows the one-time link to share. */
export function InviteForm({ assignable }: { assignable: OrgRole[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(
    assignable.includes("labeller") ? "labeller" : (assignable[0] ?? "viewer"),
  );
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);
    setCopied(false);
    startTransition(async () => {
      const result = await inviteMemberAction({ email, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      setEmail("");
    });
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            placeholder="name@company.com"
            className="h-10"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              setRole(v as OrgRole);
            }}
          >
            <SelectTrigger id="invite-role" className="h-10 w-full">
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
        </div>
        <Button type="submit" className="h-10" disabled={pending || !email.trim()}>
          {pending ? "Inviting…" : "Send invite"}
        </Button>
      </form>
      <p className="text-muted-foreground text-[12px]">{ROLES.find((r) => r.value === role)?.description}</p>
      <FormError message={error} />
      {created && (
        <div
          role="status"
          className="bg-accent text-accent-foreground grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-md p-3 text-[13px]"
        >
          <p className="flex items-start gap-2 font-medium">
            <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Invitation created for {created.email}. Share this link; it works once and expires in 7 days.
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <code className="bg-card text-foreground min-w-0 flex-1 truncate rounded border px-2 py-1.5 font-mono text-[12px]">
              {created.link}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(created.link).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
