"use client";
import { useState, useTransition, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError, FormField } from "@/features/auth";
import { slugify } from "@/features/orgs";
import { createProjectAction } from "@/server/projects/actions";

export interface TaskOption {
  id: string;
  title: string;
  /** Has a working editor in this release. */
  ready: boolean;
}

export function CreateProjectForm({ taskTypes }: { taskTypes: TaskOption[] }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [taskType, setTaskType] = useState(taskTypes.find((t) => t.ready)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction({ name, slug, taskType });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField
        id="project-name"
        label="Project name"
        placeholder="Invoices 2026"
        required
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugEdited) setSlug(slugify(e.target.value));
        }}
      />
      <FormField
        id="project-slug"
        label="URL name"
        className="font-mono"
        required
        value={slug}
        onChange={(e) => {
          setSlugEdited(true);
          setSlug(e.target.value);
        }}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="project-task">What you'll label</Label>
        <Select value={taskType} onValueChange={setTaskType}>
          <SelectTrigger id="project-task" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taskTypes.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled={!t.ready}>
                {t.title}
                {!t.ready && <span className="text-muted-foreground ml-2 text-[12px]">coming soon</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormError message={error} />
      <Button type="submit" className="h-10" disabled={pending || !name.trim() || !slug || !taskType}>
        {pending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
