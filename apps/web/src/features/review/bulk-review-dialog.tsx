"use client";
import { CheckCircle2, XCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { reviewManyAction } from "@/server/projects/actions";

/** Approve or request changes on many pages in one go, each at its current version. */
export function BulkReviewDialog({
  decision,
  onClose,
  projectId,
  assetIds,
  onDone,
}: {
  /** Which action the dialog is for; null when closed. */
  decision: "approve" | "request_changes" | null;
  onClose: () => void;
  projectId: string;
  assetIds: string[];
  onDone: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const approve = decision === "approve";
  const n = assetIds.length;
  const pages = `${String(n)} ${n === 1 ? "page" : "pages"}`;

  function submit() {
    if (!decision) return;
    setError(null);
    startTransition(async () => {
      const r = await reviewManyAction(projectId, assetIds, { decision, body });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { done, skipped, reasons } = r.data;
      const verb = approve ? "Approved" : "Requested changes on";
      onDone(
        done === 0
          ? `Nothing reviewed. ${reasons.join(" ")}`
          : `${verb} ${String(done)} ${done === 1 ? "page" : "pages"}.` +
              (skipped > 0 ? ` Skipped ${String(skipped)}: ${reasons.join(" ")}` : ""),
      );
      setBody("");
      onClose();
    });
  }

  return (
    <Dialog
      open={decision !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{approve ? `Approve ${pages}` : `Request changes on ${pages}`}</DialogTitle>
          <DialogDescription>
            {approve
              ? "Each page is approved at its current labels. Pages you sent yourself, or that aren't in review, are skipped."
              : "Each page goes back to whoever sent it, with your note. They get an email."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
          placeholder={approve ? "Comment (optional)" : "What needs to change?"}
          className="min-h-[88px] text-[13px]"
          autoFocus
        />
        {error && (
          <p role="alert" className="text-destructive text-[12px]">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={approve ? "default" : "destructive"}
            disabled={pending || n === 0 || (!approve && !body.trim())}
            onClick={submit}
          >
            {approve ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
            {pending ? "Saving…" : approve ? `Approve ${pages}` : "Request changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
