"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/features/auth";
import { acceptInvitationAction } from "@/server/orgs/actions";

export function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-4">
      <FormError message={error} />
      <Button
        className="h-10"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Joining…" : `Join ${orgName}`}
      </Button>
    </div>
  );
}
