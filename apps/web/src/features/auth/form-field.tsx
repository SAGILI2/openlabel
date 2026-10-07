import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Labelled input with an optional hint and a slot beside the label (e.g. a link). */
export function FormField({
  id,
  label,
  hint,
  aside,
  className,
  ...input
}: { id: string; label: string; hint?: string; aside?: ReactNode } & ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <Input
        id={id}
        name={id}
        className={cn("h-10", className)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-[12px]">
          {hint}
        </p>
      )}
    </div>
  );
}
