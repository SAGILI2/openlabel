"use client";
import { useState, useTransition, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/features/auth";
import { createOrganizationAction } from "@/server/orgs/actions";
import { slugify } from "./roles";

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({ name, slug });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField
        id="org-name"
        label="Organisation name"
        placeholder="Acme Research"
        autoFocus
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugEdited) setSlug(slugify(e.target.value));
        }}
      />
      <FormField
        id="org-slug"
        label="URL name"
        className="font-mono"
        hint="Lowercase letters, numbers and hyphens. Used in links and the API."
        required
        value={slug}
        onChange={(e) => {
          setSlugEdited(true);
          setSlug(e.target.value);
        }}
      />
      <FormError message={error} />
      <Button type="submit" className="h-10" disabled={pending || !name.trim() || !slug}>
        {pending ? "Creating…" : "Create organisation"}
      </Button>
    </form>
  );
}
