"use client";
import { Check, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { submitManyForReviewAction } from "@/server/projects/actions";
import { ReviewerAvatar, type ReviewerOption } from "./reviewer-picker";

/**
 * Sends many pages for review at once: pick reviewers once, every page gets them. The project's
 * default reviewers are always added, so they show ticked and locked.
 */
export function SendForReviewDialog({
  open,
  onOpenChange,
  projectId,
  assetIds,
  scopeLabel,
  reviewers,
  defaultReviewerIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  assetIds: string[];
  /** What is being sent, e.g. "3 selected pages" or "12 pages in scans/2026-07". */
  scopeLabel: string;
  reviewers: ReviewerOption[];
  defaultReviewerIds: string[];
  onDone: (message: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = new Set(defaultReviewerIds);
  const chosen = new Set([...picked, ...defaultReviewerIds]);

  function send() {
    setError(null);
    startTransition(async () => {
      const r = await submitManyForReviewAction(projectId, assetIds, picked);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { sent, skipped, reasons } = r.data;
      onDone(
        sent === 0
          ? `Nothing sent. ${reasons.join(" ")}`
          : `Sent ${String(sent)} ${sent === 1 ? "page" : "pages"} for review.` +
              (skipped > 0 ? ` Skipped ${String(skipped)}: ${reasons.join(" ")}` : ""),
      );
      setPicked([]);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send for review</DialogTitle>
          <DialogDescription>
            {scopeLabel}. Pages already in review, approved, or with no saved labels are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <p className="text-[12px] font-medium">Reviewers</p>
          {reviewers.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">
              Nobody can review yet. Invite someone with the reviewer role from Settings → Members.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto rounded-md border">
              {reviewers.map((r) => {
                const on = chosen.has(r.userId);
                const isDefault = locked.has(r.userId);
                return (
                  <li key={r.userId} className="border-b last:border-b-0">
                    <button
                      type="button"
                      disabled={isDefault || pending}
                      onClick={() => {
                        setPicked(on ? picked.filter((id) => id !== r.userId) : [...picked, r.userId]);
                      }}
                      className={cn(
                        "hover:bg-muted flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:cursor-default disabled:hover:bg-transparent",
                        on && "bg-accent/40",
                      )}
                      aria-pressed={on}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          on && "bg-primary border-primary text-primary-foreground",
                        )}
                      >
                        {on && <Check className="size-3" aria-hidden />}
                      </span>
                      <ReviewerAvatar name={r.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{r.name}</span>
                        <span className="text-muted-foreground block truncate text-[11px]">{r.email}</span>
                      </span>
                      {isDefault && (
                        <span className="text-muted-foreground text-[11px]">Default reviewer</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-destructive text-[12px]">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={pending || assetIds.length === 0 || chosen.size === 0} onClick={send}>
            <Send aria-hidden />
            {pending
              ? "Sending…"
              : `Send ${String(assetIds.length)} ${assetIds.length === 1 ? "page" : "pages"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
