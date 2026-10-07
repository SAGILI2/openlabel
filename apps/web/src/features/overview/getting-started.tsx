import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SetupStep {
  title: string;
  description: string;
  done: boolean;
}

/**
 * First-run checklist. These steps really are a sequence (each depends on the one before),
 * so they are numbered.
 */
export function GettingStarted({ steps }: { steps: readonly SetupStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="setup-heading" className="bg-card rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="setup-heading" className="font-semibold">
          Set up your workspace
        </h2>
        <span className="text-muted-foreground text-[13px]">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <div
        className="bg-muted mx-4 mt-4 h-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
      >
        <div
          className="bg-brand h-full rounded-full transition-[width]"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ol className="p-2">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-md px-2 py-2.5">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium",
                step.done ? "bg-brand border-brand text-brand-foreground" : "text-muted-foreground",
              )}
              aria-hidden
            >
              {step.done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
            </span>
            <div>
              <p
                className={cn("font-medium", step.done && "text-muted-foreground line-through decoration-1")}
              >
                {step.title}
              </p>
              <p className="text-muted-foreground text-[13px]">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
