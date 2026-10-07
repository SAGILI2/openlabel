"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormError } from "@/features/auth";
import { setReviewRulesAction } from "@/server/projects/actions";
import { ReviewerAvatar, ReviewerPicker, type ReviewerOption } from "./reviewer-picker";

/** Project review rules, in the spirit of branch protection on a repository. */
export function ReviewRulesForm({
  projectId,
  initial,
  reviewers,
  canEdit,
}: {
  projectId: string;
  initial: { requiredApprovals: number; allowSelfApproval: boolean; defaultReviewerIds: string[] };
  reviewers: ReviewerOption[];
  canEdit: boolean;
}) {
  const [required, setRequired] = useState(initial.requiredApprovals);
  const [selfApproval, setSelfApproval] = useState(initial.allowSelfApproval);
  const [defaults, setDefaults] = useState(initial.defaultReviewerIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const chosen = reviewers.filter((r) => defaults.includes(r.userId));
  const changed =
    required !== initial.requiredApprovals ||
    selfApproval !== initial.allowSelfApproval ||
    defaults.slice().sort().join() !== initial.defaultReviewerIds.slice().sort().join();

  return (
    <form
      className="grid max-w-[640px] gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const r = await setReviewRulesAction(projectId, {
            requiredApprovals: required,
            allowSelfApproval: selfApproval,
            defaultReviewerIds: defaults,
          });
          if (!r.ok) setError(r.error);
          else setSaved(true);
        });
      }}
    >
      <section className="grid gap-3">
        <div>
          <h3 className="font-semibold">Required approvals</h3>
          <p className="text-muted-foreground text-[13px]">
            A page counts as approved once this many reviewers approve its current labels. Editing the labels
            clears earlier approvals.
          </p>
        </div>
        <RadioGroup
          value={String(required)}
          onValueChange={(v) => {
            setRequired(Number(v));
          }}
          className="flex flex-wrap gap-2"
          disabled={!canEdit}
        >
          {[1, 2, 3].map((n) => (
            <label
              key={n}
              htmlFor={`required-${String(n)}`}
              className="has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-accent flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
            >
              <RadioGroupItem id={`required-${String(n)}`} value={String(n)} />
              {n} {n === 1 ? "approval" : "approvals"}
            </label>
          ))}
        </RadioGroup>
      </section>

      <section className="grid gap-3">
        <div>
          <h3 className="font-semibold">Default reviewers</h3>
          <p className="text-muted-foreground text-[13px]">
            Requested automatically on every page sent for review, like code owners on a pull request.
          </p>
        </div>
        <div className="bg-card grid gap-2 rounded-md border p-3">
          <ReviewerPicker
            options={reviewers}
            selected={defaults}
            onChange={setDefaults}
            disabled={!canEdit}
            trigger="Choose reviewers"
          />
          {chosen.length === 0 ? (
            <p className="text-muted-foreground text-[12px]">
              None. Labellers pick reviewers when they send a page.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {chosen.map((r) => (
                <li key={r.userId} className="flex items-center gap-2 text-[13px]">
                  <ReviewerAvatar name={r.name} />
                  {r.name}
                  <span className="text-muted-foreground text-[12px]">{r.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex items-start gap-3">
        <Checkbox
          id="self-approval"
          checked={selfApproval}
          disabled={!canEdit}
          onCheckedChange={(v) => {
            setSelfApproval(v === true);
          }}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="self-approval">Allow approving your own pages</Label>
          <p className="text-muted-foreground text-[13px]">
            Useful when you label alone. Leave off when a second person should always check.
          </p>
        </div>
      </section>

      <FormError message={error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !changed}>
            {pending ? "Saving…" : "Save rules"}
          </Button>
          {saved && !changed && <span className="text-success text-[13px]">Saved</span>}
        </div>
      )}
    </form>
  );
}
