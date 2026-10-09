"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/features/auth";
import { setProjectClassesAction } from "@/server/projects/actions";
import { ClassListEditor, type ClassItem } from "./class-list-editor";

/** Project settings: the classes people pick from, and whether a file can have several. */
export function ClassSettingsForm({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: { classes: { key: string; name: string }[]; multiLabel: boolean };
  canEdit: boolean;
}) {
  const [classes, setClasses] = useState<ClassItem[]>(initial.classes);
  const [multiLabel, setMultiLabel] = useState(initial.multiLabel);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed =
    multiLabel !== initial.multiLabel ||
    JSON.stringify(classes.map((c) => [c.key ?? null, c.name])) !==
      JSON.stringify(initial.classes.map((c) => [c.key, c.name]));

  return (
    <form
      className="grid max-w-[640px] gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const r = await setProjectClassesAction(projectId, { classes, multiLabel });
          if (!r.ok) setError(r.error);
          else {
            setClasses(r.data.classes);
            setSaved(true);
          }
        });
      }}
    >
      <ClassListEditor value={classes} onChange={setClasses} disabled={!canEdit} />
      <label htmlFor="settings-multi-label" className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id="settings-multi-label"
          checked={multiLabel}
          disabled={!canEdit}
          onCheckedChange={(v) => {
            setMultiLabel(v === true);
          }}
          className="mt-0.5"
        />
        <span>
          <span className="block text-[13px] font-medium">More than one class per file</span>
          <span className="text-muted-foreground block text-[12px]">
            Off: picking a class replaces the previous one.
          </span>
        </span>
      </label>
      <FormError message={error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !changed || classes.length === 0}>
            {pending ? "Saving…" : "Save classes"}
          </Button>
          {saved && !changed && <span className="text-success text-[13px]">Saved</span>}
        </div>
      )}
    </form>
  );
}
