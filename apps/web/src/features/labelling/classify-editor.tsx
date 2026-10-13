"use client";
import { ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ReviewPanel, type ReviewerOption, type ReviewView } from "@/features/review";
import { saveAnnotationAction, submitForReviewAction } from "@/server/projects/actions";
import type { StripItem } from "./editor";

export interface ClassifyEditorProps {
  assetId: string;
  assetName: string;
  projectName: string;
  imageUrl: string;
  classes: { key: string; name: string }[];
  multiLabel: boolean;
  initialLabels: string[];
  baseVersion: number;
  backHref: string;
  strip: StripItem[];
  review: ReviewView;
  reviewers: ReviewerOption[];
  canReview: boolean;
}

/**
 * Whole-file classification: the file on the left, its classes on the right. Number keys pick a
 * class; with one class per file, picking saves and moves to the next file, so a reviewer can
 * sort hundreds of documents from the keyboard.
 */
export function ClassifyEditor(props: ClassifyEditorProps) {
  const router = useRouter();
  const [labels, setLabels] = useState<string[]>(props.initialLabels);
  const [version, setVersion] = useState(props.baseVersion);
  const [savedLabels, setSavedLabels] = useState(props.initialLabels.join("|"));
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"label" | "review">(
    props.review.status === "submitted" && props.canReview ? "review" : "label",
  );
  const [reopened, setReopened] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const stripRef = useRef<HTMLDivElement>(null);

  const dirty = labels.join("|") !== savedLabels;
  const reviewStatus = reopened ? "in_progress" : props.review.status;
  const submittable = !["submitted", "approved"].includes(reviewStatus);
  const sentBefore = props.review.requested.length > 0 || props.review.history.length > 0;
  const index = props.strip.findIndex((s) => s.id === props.assetId);
  const prev = index > 0 ? props.strip[index - 1] : undefined;
  const next = index >= 0 && index < props.strip.length - 1 ? props.strip[index + 1] : undefined;

  /** Saves the given labels as a new version when they differ from what's stored. */
  function save(nextLabels: string[], then?: string) {
    if (nextLabels.join("|") === savedLabels || nextLabels.length === 0) {
      if (then) router.push(then);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await saveAnnotationAction(props.assetId, { labels: nextLabels }, version);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setVersion(r.data.version);
      setSavedLabels(nextLabels.join("|"));
      if (props.review.status === "submitted" || props.review.status === "approved") setReopened(true);
      if (then) router.push(then);
      else router.refresh();
    });
  }

  function pick(key: string) {
    if (props.multiLabel) {
      setLabels(labels.includes(key) ? labels.filter((l) => l !== key) : [...labels, key]);
      return;
    }
    setLabels([key]);
    // One class per file: picking is the whole job, so save and move on.
    save([key], next?.href);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    if (dirty || version === 0) {
      const r = await saveAnnotationAction(props.assetId, { labels }, version);
      if (!r.ok) {
        setError(r.error);
        setSubmitting(false);
        return;
      }
      setVersion(r.data.version);
      setSavedLabels(labels.join("|"));
    }
    const sent = await submitForReviewAction(
      props.assetId,
      props.review.requested.map((r) => r.userId),
    );
    setSubmitting(false);
    if (!sent.ok) {
      setError(sent.error);
      return;
    }
    setReopened(false);
    setPanel("review");
    router.refresh();
  }

  // Multi-label: save shortly after the last toggle, like the OCR editor's autosave.
  useEffect(() => {
    if (!props.multiLabel || !dirty || pending || labels.length === 0) return;
    const t = setTimeout(() => {
      save(labels);
    }, 1200);
    return () => {
      clearTimeout(t);
    };
  });

  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) {
        const c = props.classes[n - 1];
        if (c && panel === "label") pick(c.key);
      } else if (e.key === "]" || e.key === "ArrowRight") {
        if (next) save(labels, next.href);
      } else if (e.key === "[" || e.key === "ArrowLeft") {
        if (prev) router.push(prev.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const nameOf = new Map(props.classes.map((c) => [c.key, c.name]));
  const status = error
    ? error
    : pending
      ? "Saving…"
      : dirty
        ? "Not saved yet"
        : version > 0
          ? submittable && sentBefore
            ? "Saved, not sent for review"
            : "Saved"
          : "Not labelled yet";

  return (
    <div className="bg-background flex h-dvh flex-col">
      <header className="bg-card flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <Link
          href={props.backHref}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px]"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden max-w-[180px] truncate sm:inline">{props.projectName}</span>
        </Link>
        <span className="text-border hidden sm:inline">/</span>
        <span className="min-w-0 truncate font-mono text-[12.5px]">{props.assetName}</span>
        {index >= 0 && (
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
            {index + 1}/{props.strip.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span
            role="status"
            className={cn(
              "hidden text-[12px] md:inline",
              error
                ? "text-destructive"
                : dirty
                  ? "text-[#9a6b00] dark:text-[#E8A400]"
                  : "text-muted-foreground",
            )}
          >
            {status}
          </span>
          <Link
            href={prev?.href ?? "#"}
            aria-disabled={!prev}
            aria-label="Previous file ([)"
            className={cn("hover:bg-muted rounded-md p-1.5", !prev && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <button
            type="button"
            aria-label="Next file (])"
            disabled={!next || pending}
            onClick={() => {
              if (next) save(labels, next.href);
            }}
            className="hover:bg-muted rounded-md p-1.5 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
          {submittable ? (
            <button
              type="button"
              disabled={pending || submitting || (version === 0 && labels.length === 0)}
              title={labels.length === 0 ? "Pick a class first" : "Send this file to reviewers"}
              onClick={() => {
                void submit();
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium disabled:opacity-60"
            >
              <Send className="size-3.5" />
              {submitting
                ? "Sending…"
                : reviewStatus === "rejected" || sentBefore
                  ? "Resubmit"
                  : "Submit for review"}
            </button>
          ) : (
            <span
              className={cn(
                "hidden items-center gap-1.5 text-[12px] font-medium sm:flex",
                props.review.status === "approved" ? "text-success" : "text-[#9a6b00] dark:text-[#E8A400]",
              )}
            >
              {props.review.status === "approved" ? (
                <CheckCircle2 className="size-3.5" aria-hidden />
              ) : (
                <CircleDot className="size-3.5" aria-hidden />
              )}
              {props.review.status === "approved" ? "Approved" : "In review"}
            </span>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-1">
        <div className="bg-muted/40 relative grid min-h-0 place-items-center overflow-auto p-4">
          <img
            src={props.imageUrl}
            alt={props.assetName}
            className="max-h-full max-w-full rounded border bg-white object-contain shadow-sm"
          />
        </div>

        <aside className="bg-card flex max-h-[45dvh] min-h-0 flex-col border-t md:max-h-none md:border-t-0 md:border-l">
          <div className="flex gap-4 border-b px-4" role="tablist" aria-label="Inspector">
            {(
              [
                ["label", "Class"],
                ["review", "Review"],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                onClick={() => {
                  setPanel(id);
                }}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-[13px] font-medium",
                  panel === id
                    ? "border-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {title}
                {id === "review" && props.review.status === "approved" && (
                  <Check className="text-success size-3.5" aria-label="approved" />
                )}
                {id === "review" && props.review.status === "rejected" && (
                  <span className="bg-destructive size-1.5 rounded-full" aria-label="changes requested" />
                )}
              </button>
            ))}
          </div>

          {panel === "review" ? (
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-4">
              <ReviewPanel
                assetId={props.assetId}
                review={{ ...props.review, currentVersion: version }}
                reviewers={props.reviewers}
                canReview={props.canReview}
                dirty={dirty}
              />
            </div>
          ) : (
            <div className="scrollbar-none grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
              <p className="text-muted-foreground text-[12px]">
                {props.multiLabel
                  ? "Pick every class that applies. Keys 1–9 toggle; ] saves and opens the next file."
                  : "Pick one. Keys 1–9 pick, save and open the next file."}
              </p>
              {props.classes.length === 0 ? (
                <p className="text-[13px]">
                  This project has no classes yet. Add them in the project&apos;s Settings.
                </p>
              ) : (
                <ul
                  className="grid gap-1.5"
                  role={props.multiLabel ? "group" : "radiogroup"}
                  aria-label="Classes"
                >
                  {props.classes.map((c, i) => {
                    const on = labels.includes(c.key);
                    return (
                      <li key={c.key}>
                        <button
                          type="button"
                          role={props.multiLabel ? "checkbox" : "radio"}
                          aria-checked={on}
                          disabled={pending}
                          onClick={() => {
                            pick(c.key);
                          }}
                          className={cn(
                            "hover:bg-muted flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                            on && "border-brand bg-accent hover:bg-accent",
                          )}
                        >
                          <kbd
                            className={cn(
                              "grid size-6 shrink-0 place-items-center rounded border font-mono text-[11px] tabular-nums",
                              on ? "border-brand bg-brand text-brand-foreground" : "text-muted-foreground",
                            )}
                          >
                            {i < 9 ? i + 1 : "·"}
                          </kbd>
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{c.name}</span>
                          {on && <Check className="text-brand size-4" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {labels.some((l) => !nameOf.has(l)) && (
                <p className="text-destructive text-[12px]">
                  This file has a class that was removed from the project. Pick again.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {props.strip.length > 1 && (
        <div
          ref={stripRef}
          className="bg-card scrollbar-none flex h-[84px] shrink-0 gap-2 overflow-x-auto border-t px-3 py-2"
        >
          {props.strip.map((s, i) => {
            const current = s.id === props.assetId;
            return (
              <Link
                key={s.id}
                href={s.href}
                aria-current={current ? "page" : undefined}
                title={s.name}
                className={cn(
                  "relative h-full w-[52px] shrink-0 overflow-hidden rounded border bg-white",
                  current ? "ring-brand ring-2" : "opacity-75 hover:opacity-100",
                )}
              >
                <img
                  src={`/api/assets/${s.id}/thumb`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
                <span className="bg-card/90 absolute bottom-0.5 left-0.5 rounded px-1 font-mono text-[9px] tabular-nums">
                  {i + 1}
                </span>
                {s.done && (
                  <span className="bg-success absolute top-0.5 right-0.5 grid size-3.5 place-items-center rounded-full text-white">
                    <Check className="size-2.5" />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
