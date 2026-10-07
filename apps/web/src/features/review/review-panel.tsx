"use client";
import { CheckCircle2, CircleDot, MessageSquare, Send, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { LocalTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { reviewAction, setRequestedReviewersAction, submitForReviewAction } from "@/server/projects/actions";
import { ReviewerAvatar, ReviewerPicker, type ReviewerOption } from "./reviewer-picker";

export interface ReviewView {
  status: "new" | "prelabelling" | "prelabelled" | "in_progress" | "submitted" | "approved" | "rejected";
  currentVersion: number;
  submittedByMe: boolean;
  requiredApprovals: number;
  allowSelfApproval: boolean;
  approvals: number;
  requested: {
    userId: string;
    name: string;
    latest: "approve" | "request_changes" | "comment" | null;
    stale: boolean;
  }[];
  history: {
    id: string;
    reviewerName: string | null;
    decision: "approve" | "request_changes" | "comment";
    body: string;
    annotationVersion: number;
    createdAt: string;
  }[];
}

const STATE: Record<string, { label: string; tone: string; icon: typeof CircleDot }> = {
  draft: { label: "Not sent for review", tone: "text-muted-foreground", icon: CircleDot },
  submitted: { label: "Waiting for review", tone: "text-[#9a6b00] dark:text-[#E8A400]", icon: CircleDot },
  approved: { label: "Approved", tone: "text-success", icon: CheckCircle2 },
  rejected: { label: "Changes requested", tone: "text-destructive", icon: XCircle },
};

function verdictIcon(decision: string | null, stale: boolean) {
  if (stale || !decision)
    return <CircleDot className="text-muted-foreground size-3.5" aria-label="Pending" />;
  if (decision === "approve") return <CheckCircle2 className="text-success size-3.5" aria-label="Approved" />;
  if (decision === "request_changes")
    return <XCircle className="text-destructive size-3.5" aria-label="Changes requested" />;
  return <MessageSquare className="text-muted-foreground size-3.5" aria-label="Commented" />;
}

/**
 * Pull-request style review for one page: state, reviewers with their verdicts, submit for review,
 * and Approve / Request changes / Comment with the history below.
 */
export function ReviewPanel({
  assetId,
  review,
  reviewers,
  canReview,
  dirty,
}: {
  assetId: string;
  review: ReviewView;
  reviewers: ReviewerOption[];
  canReview: boolean;
  /** Unsaved label edits: submitting/reviewing is disabled until saved. */
  dirty: boolean;
}) {
  const [decision, setDecision] = useState<"comment" | "approve" | "request_changes">("approve");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Before the first submit, chosen reviewers live here; afterwards they're stored on the page.
  // A page edited after it was sent keeps its earlier reviewers, ready to resend.
  const [draftReviewers, setDraftReviewers] = useState<string[]>(() => review.requested.map((r) => r.userId));
  const stateKey =
    review.status === "submitted" || review.status === "approved" || review.status === "rejected"
      ? review.status
      : "draft";
  const { label, tone, icon: StateIcon } = STATE[stateKey] ?? { label: "", tone: "", icon: CircleDot };
  const isDraft = stateKey === "draft";
  const editedSinceSent = isDraft && review.history.length + review.requested.length > 0;
  const shown = isDraft
    ? reviewers
        .filter((r) => draftReviewers.includes(r.userId))
        .map((r) => ({ userId: r.userId, name: r.name, latest: null, stale: false }))
    : review.requested;
  const requestedIds = shown.map((r) => r.userId);
  const ownPage = review.submittedByMe && !review.allowSelfApproval;
  // You can't approve or reject your own page, so only "comment" is open to you.
  const verdict = ownPage ? "comment" : decision;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else after?.();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", tone)}>
          <StateIcon className="size-4" aria-hidden />
          {editedSinceSent ? "Edited, not sent yet" : label}
        </span>
        <span className="text-muted-foreground text-[12px] tabular-nums">
          {review.approvals}/{review.requiredApprovals} approvals
        </span>
      </div>

      {/* Reviewers */}
      <div className="grid gap-2">
        <ReviewerPicker
          options={reviewers}
          selected={requestedIds}
          disabled={pending}
          onChange={(ids) => {
            if (isDraft) setDraftReviewers(ids);
            else run(() => setRequestedReviewersAction(assetId, ids));
          }}
        />
        {shown.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">No reviewers yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {shown.map((r) => (
              <li key={r.userId} className="flex items-center gap-2 text-[13px]">
                <ReviewerAvatar name={r.name} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.stale && <span className="text-muted-foreground text-[11px]">outdated</span>}
                {verdictIcon(r.latest, r.stale)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      {(stateKey === "draft" || stateKey === "rejected") && (
        <Button
          size="sm"
          disabled={pending || dirty || review.currentVersion === 0}
          onClick={() => {
            run(() => submitForReviewAction(assetId, requestedIds));
          }}
        >
          <Send aria-hidden />
          {stateKey === "rejected" || editedSinceSent ? "Send back for review" : "Send for review"}
        </Button>
      )}
      {dirty && <p className="text-muted-foreground text-[11px]">Save your changes before reviewing.</p>}

      {/* Review form */}
      {canReview && stateKey !== "draft" && (
        <form
          className="grid gap-2.5 rounded-md border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => reviewAction(assetId, { decision: verdict, body, version: review.currentVersion }),
              () => {
                setBody("");
              },
            );
          }}
        >
          <p className="text-[12px] font-medium">Your review</p>
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
            }}
            placeholder={
              verdict === "request_changes" ? "What needs to change?" : "Leave a comment (optional)"
            }
            className="min-h-[64px] text-[13px]"
          />
          <RadioGroup
            value={verdict}
            onValueChange={(v) => {
              setDecision(v as typeof decision);
            }}
            className="gap-1.5"
          >
            {(
              [
                ["comment", "Comment", "Feedback without a verdict."],
                ["approve", "Approve", "The labels are correct."],
                ["request_changes", "Request changes", "Send back to the labeller."],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                htmlFor={`decision-${value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded px-1 py-1",
                  ownPage && value !== "comment" && "cursor-not-allowed opacity-50",
                )}
              >
                <RadioGroupItem
                  id={`decision-${value}`}
                  value={value}
                  className="mt-0.5"
                  disabled={ownPage && value !== "comment"}
                />
                <span>
                  <span className="block text-[13px] font-medium">{title}</span>
                  <span className="text-muted-foreground block text-[11px]">{hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {ownPage && (
            <p className="text-muted-foreground text-[11px]">
              You sent this page, so someone else needs to approve it.
            </p>
          )}
          <Button type="submit" size="sm" disabled={pending || dirty}>
            Submit review
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-destructive text-[12px]">
          {error}
        </p>
      )}

      {/* History */}
      {review.history.length > 0 && (
        <ol className="grid gap-3 border-t pt-3">
          {[...review.history].reverse().map((h) => (
            <li key={h.id} className="grid gap-1">
              <div className="flex items-center gap-2 text-[12px]">
                <ReviewerAvatar name={h.reviewerName ?? "?"} className="size-5" />
                <span className="font-medium">{h.reviewerName ?? "Former member"}</span>
                <span className="text-muted-foreground">
                  {h.decision === "approve"
                    ? "approved"
                    : h.decision === "request_changes"
                      ? "requested changes"
                      : "commented"}
                </span>
                {h.annotationVersion !== review.currentVersion && (
                  <span className="text-muted-foreground rounded border px-1 text-[10px]">
                    v{h.annotationVersion}
                  </span>
                )}
              </div>
              {h.body && <p className="pl-7 text-[13px] whitespace-pre-wrap">{h.body}</p>}
              <p className="text-muted-foreground pl-7 text-[11px]">
                <LocalTime iso={h.createdAt} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
