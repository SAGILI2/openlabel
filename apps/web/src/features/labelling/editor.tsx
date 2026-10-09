"use client";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Keyboard,
  Magnet,
  Pencil,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Trash2,
  Maximize,
  Send,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ReviewPanel, type ReviewerOption, type ReviewView } from "@/features/review";
import { savePreferencesAction } from "@/server/preferences/actions";
import { reocrTurnedAction, saveAnnotationAction, submitForReviewAction } from "@/server/projects/actions";
import { BoxCard } from "./box-card";
import type { CanvasHandle } from "./canvas-stage";
import { Connector } from "./connector";
import { linesFromWords, moveToLine, place, refile, reorder, wordsInReadingOrder } from "./lines";
import type { ImageRegion } from "@openlabel/contracts";
import { PageStrip } from "./page-strip";
import {
  annotationFromWords,
  documentAnnotation,
  needsCheck,
  turnBox,
  wordState,
  type Box,
  type EditableWord,
} from "./regions";
import { loadInk, snapToInk, type Ink } from "./snap";
import { Transcript } from "./transcript";

// Konva needs the browser; never render it on the server.
const CanvasStage = dynamic(() => import("./canvas-stage").then((m) => m.CanvasStage), { ssr: false });

export interface StripItem {
  id: string;
  name: string;
  href: string;
  done: boolean;
}

/** A multi-page document (PDF): this editor shows one page of it. */
export interface DocumentView {
  page: number;
  pageCount: number;
  /** Regions of the document's other pages, saved with this page's so nothing is lost. */
  otherRegions: ImageRegion[];
  /** Pages a person has saved; the rest are OCR drafts. */
  checkedPages: number[];
  /** Link to this document ending in `page=`; append a page number (keeps the folder filter). */
  pageHrefBase: string;
  /** OCR'd word count per page (index 0 = page 1) and the turn the OCR applied. */
  pages: { words: number; rotation: number }[];
}

export interface EditorProps {
  /** Set when the file is a PDF with several pages. */
  document?: DocumentView | undefined;
  /** The person's saved display settings (they follow them across files and projects). */
  preferences: { showBoxes: boolean; showLink: boolean; hideFileStrip: boolean };
  assetId: string;
  assetName: string;
  projectName: string;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  /** How far the OCR turned this page (degrees counter-clockwise) to read it upright. */
  rotation: number;
  /** OCR is waiting or running for this file (e.g. after turning the page). */
  reading: boolean;
  initialWords: EditableWord[];
  baseVersion: number;
  source: "annotation" | "prediction" | "empty";
  engine: string | null;
  backHref: string;
  /** Pages around this one in the current folder, in order, for the film-strip and prev/next. */
  strip: StripItem[];
  /** This page's position (0-based) and the folder's page count, for the "12/80,245" counter. */
  position: number;
  total: number;
  review: ReviewView;
  reviewers: ReviewerOption[];
  canReview: boolean;
}

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "grid size-9 place-items-center rounded-md transition-colors",
            active
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        {shortcut && <kbd className="text-muted-foreground font-mono text-[11px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Full-screen labelling workspace: thin top bar, floating tool palette, the page, an inspector
 * with the selected word enlarged above its text, and a film-strip of the folder's pages.
 */
export function Editor(props: EditorProps) {
  const router = useRouter();
  const [words, setWords] = useState(props.initialWords);
  // Reading order: lines of word ids. Words keep their own boxes.
  const [lines, setLines] = useState<string[][]>(() => linesFromWords(props.initialWords));
  // Something is always selected: the first word of the first line until you pick another.
  const [chosenId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(props.preferences);
  /** Flips a display setting now and saves it for next time. */
  const togglePref = (key: keyof EditorProps["preferences"]) => {
    const value = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    void savePreferencesAction({ [key]: value }).catch(() => undefined);
  };
  const stripHidden = prefs.hideFileStrip;
  const [linkTick, setLinkTick] = useState(0);
  const inkRef = useRef<Ink | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const openMenu = (id: string, x: number, y: number) => {
    setMenu({ id, x, y });
  };
  const canvasRef = useRef<CanvasHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(props.baseVersion);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [panel, setPanel] = useState<"label" | "review">(
    props.review.status === "submitted" && props.canReview ? "review" : "label",
  );
  const [pending, startTransition] = useTransition();
  // Saving a page that is in review or approved reopens it as a draft (the server drops it back to
  // in-progress and earlier approvals go stale). Track that here until the page reloads.
  const [reopened, setReopened] = useState(false);
  const reviewStatus = reopened ? "in_progress" : props.review.status;
  /** Sent for review before, so the button resends to the same reviewers. */
  const sentBefore = props.review.requested.length > 0 || props.review.history.length > 0;
  const stripRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const index = props.strip.findIndex((s) => s.id === props.assetId);
  const prev = index > 0 ? props.strip[index - 1] : undefined;
  const next = index >= 0 && index < props.strip.length - 1 ? props.strip[index + 1] : undefined;

  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const selectedId = chosenId && byId.has(chosenId) ? chosenId : (lines[0]?.[0] ?? null);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const lineIndex = selectedId ? lines.findIndex((l) => l.includes(selectedId)) : -1;
  const selectedLine = lineIndex >= 0 ? (lines[lineIndex] ?? []) : [];
  const lowCount = words.filter(needsCheck).length;
  const editedCount = words.filter((w) => wordState(w) === "edited").length;
  const ordered = useMemo(() => lines.flat(), [lines]);

  const command = (kind: Parameters<CanvasHandle["zoom"]>[0]) => {
    canvasRef.current?.zoom(kind);
  };

  // What gets saved: text, boxes, and whether a person confirmed the word.
  const signature = (ws: EditableWord[], ls: string[][]) =>
    JSON.stringify([
      ls,
      ws.map((w) => [
        w.id,
        w.text,
        w.verified === true,
        Math.round(w.box.x),
        Math.round(w.box.y),
        Math.round(w.box.width),
        Math.round(w.box.height),
      ]),
    ]);
  const savedSignature = useRef(signature(props.initialWords, linesFromWords(props.initialWords)));

  /** Applies a change to words and/or lines and recomputes whether there's anything to save. */
  function update(
    fn: (ws: EditableWord[]) => EditableWord[],
    lineFn?: (ls: string[][], ws: EditableWord[]) => string[][],
  ) {
    const nextWords = fn(words);
    const nextLines = lineFn ? lineFn(lines, nextWords) : lines;
    setWords(nextWords);
    setLines(nextLines);
    setDirty(signature(nextWords, nextLines) !== savedSignature.current);
  }

  /** The annotation to save: this page alone, or for a PDF, this page merged into the document. */
  const toSave = () => {
    const d = props.document;
    const page = annotationFromWords(wordsInReadingOrder(lines, words), d?.page);
    return d ? documentAnnotation(d.otherRegions, page, d.page, d.checkedPages) : page;
  };

  /** Saves a draft version if the labels changed; then optionally navigates. */
  const save = useCallback(
    (then?: string) => {
      const sig = signature(words, lines);
      if (sig === savedSignature.current) {
        setDirty(false);
        if (then) router.push(then);
        return;
      }
      setError(null);
      startTransition(async () => {
        const result = await saveAnnotationAction(props.assetId, toSave(), version);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedSignature.current = sig;
        setVersion(result.data.version);
        setDirty(false);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        if (then) router.push(then);
        else if (props.review.status === "submitted" || props.review.status === "approved") {
          setReopened(true);
          router.refresh();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toSave reads words, lines and props
    [props.assetId, props.review.status, words, lines, version, router],
  );

  const [submitting, setSubmitting] = useState(false);
  /** Labeller can submit while the page is a draft or was sent back with changes requested. */
  const submittable = !["submitted", "approved"].includes(reviewStatus);

  /** Final step: flush any pending draft, then send the page to reviewers. */
  async function submit() {
    setSubmitting(true);
    setError(null);
    const sig = signature(words, lines);
    if (sig !== savedSignature.current || version === 0) {
      const saved = await saveAnnotationAction(props.assetId, toSave(), version);
      if (!saved.ok) {
        setError(saved.error);
        setSubmitting(false);
        return;
      }
      savedSignature.current = sig;
      setVersion(saved.data.version);
      setDirty(false);
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

  // Autosave: a draft version 1.5 s after the last change, so work is never lost.
  useEffect(() => {
    if (!dirty || pending) return;
    const t = setTimeout(() => {
      save();
    }, 1500);
    return () => {
      clearTimeout(t);
    };
  }, [dirty, pending, words, save]);

  // Decode the page once for snapping.
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = props.imageUrl;
    let live = true;
    void loadInk(img)
      .then((ink) => {
        if (live) inkRef.current = ink;
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.imageUrl]);

  function select(id: string | null, focusText = false) {
    setSelectedId(id);
    setNote(null);
    if (id && focusText)
      requestAnimationFrame(() =>
        transcriptRef.current?.querySelector<HTMLInputElement>(`[data-id="${CSS.escape(id)}"]`)?.focus(),
      );
  }

  /** A box drawn on the page: snap it to the text inside, then file it into its line. */
  function onDraw(rough: Box) {
    const tight = inkRef.current ? snapToInk(inkRef.current, rough) : null;
    const id = `u${Date.now().toString(36)}`;
    const w: EditableWord = { id, text: "", box: tight ?? rough, conf: null };
    const p = place(lines, words, w);
    update(
      (ws) => [...ws, w],
      () => p.lines,
    );
    const prev = p.lines[p.line]?.[(p.lines[p.line]?.indexOf(id) ?? 0) - 1];
    setSelectedId(id);
    setNote(
      (tight ? "Snapped to the text you drew around. " : "No clear text inside, kept your box. ") +
        (p.newLine
          ? `Not level with any line, so it starts line ${String(p.line + 1)}.`
          : `Placed in line ${String(p.line + 1)}${prev ? `, after “${byId.get(prev)?.text || "…"}”.` : ", at the start."}`),
    );
    requestAnimationFrame(() =>
      transcriptRef.current?.querySelector<HTMLInputElement>(`[data-id="${id}"]`)?.focus(),
    );
  }

  /** A box moved or resized: it keeps its line unless it clearly left it. */
  function onChangeBox(id: string, box: Box) {
    const before = lines.findIndex((l) => l.includes(id));
    const w = byId.get(id);
    if (!w) return;
    const moved = { ...w, box };
    const p = refile(
      lines,
      words.map((x) => (x.id === id ? moved : x)),
      moved,
    );
    update(
      (ws) => ws.map((x) => (x.id === id ? moved : x)),
      () => p.lines,
    );
    setNote(p.line === before ? null : `Moved to line ${String(p.line + 1)}.`);
  }

  function snapSelected() {
    if (!selected || !inkRef.current) return;
    const m = 8;
    const t = snapToInk(inkRef.current, {
      x: selected.box.x - m,
      y: selected.box.y - m,
      width: selected.box.width + 2 * m,
      height: selected.box.height + 2 * m,
    });
    if (!t) {
      setNote("No clear text near this box; left as it is.");
      return;
    }
    onChangeBox(selected.id, t);
    setNote("Snapped to the text.");
  }

  function remove(id: string) {
    const i = ordered.indexOf(id);
    update(
      (ws) => ws.filter((w) => w.id !== id),
      (ls) => ls.map((l) => l.filter((x) => x !== id)).filter((l) => l.length > 0),
    );
    setSelectedId(ordered[i + 1] ?? ordered[i - 1] ?? null);
    setNote(null);
  }

  function setText(id: string, text: string) {
    update((ws) => ws.map((w) => (w.id === id ? { ...w, text } : w)));
  }

  function step(delta: 1 | -1) {
    const i = selectedId ? ordered.indexOf(selectedId) : -1;
    const target = ordered[i === -1 ? 0 : Math.min(Math.max(i + delta, 0), ordered.length - 1)];
    if (target) select(target, true);
  }

  /** The next word (after the selected one, wrapping) the OCR wasn't sure about. */
  function nextLow() {
    const start = selectedId ? ordered.indexOf(selectedId) : -1;
    for (let k = 1; k <= ordered.length; k++) {
      const id = ordered[(start + k) % ordered.length];
      const w = id ? byId.get(id) : undefined;
      if (w && needsCheck(w)) {
        select(w.id, true);
        canvasRef.current?.zoom("focus");
        return;
      }
    }
  }

  /** Confirms an OCR word is right as read (V on a selected word, or the ✓ in the box card). */
  function verify(id: string, on = true) {
    update((ws) => ws.map((w) => (w.id === id ? { ...w, verified: on } : w)));
  }

  /** Puts back what the OCR read. */
  function revert(id: string) {
    update((ws) => ws.map((w) => (w.id === id && w.ocrText !== undefined ? { ...w, text: w.ocrText } : w)));
  }

  function moveLine(dir: -1 | 1) {
    if (!selectedId) return;
    update(
      (ws) => ws,
      (ls, ws) => moveToLine(ls, ws, selectedId, dir),
    );
    setNote(dir < 0 ? "Moved to the line above." : "Moved to the line below.");
  }

  function reorderWord(dir: -1 | 1) {
    if (!selectedId) return;
    update(
      (ws) => ws,
      (ls) => reorder(ls, selectedId, dir),
    );
  }

  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [stripHidden]);

  // Keyboard shortcuts (the list is behind the keyboard icon in the top bar).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = props.document;
      if (d && (e.key === "PageDown" || e.key === "PageUp")) {
        const to = d.page + (e.key === "PageDown" ? 1 : -1);
        if (to >= 1 && to <= d.pageCount) {
          e.preventDefault();
          save(d.pageHrefBase + String(to));
        }
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return; // the text fields handle their own keys
      if (e.key === "f") command("fit");
      else if (e.key === "z" && selectedId) command("focus");
      else if (e.key === "+" || e.key === "=") command("in");
      else if (e.key === "-") command("out");
      else if (e.key === "Escape") select(null);
      else if (e.key === "n" || e.key === "N") nextLow();
      else if (e.key === "v" || e.key === "V") togglePref("showBoxes");
      else if (e.key === "l" || e.key === "L") togglePref("showLink");
      else if (e.key === "b" || e.key === "B") togglePref("hideFileStrip");
      else if (!chosenId || !selectedId) {
        if (e.key === "]" && next) save(next.href);
        else if (e.key === "[" && prev) router.push(prev.href);
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selectedId);
      } else if (e.key === "s" || e.key === "S") snapSelected();
      else if ((e.key === "c" || e.key === "C") && selected) verify(selectedId, !selected.verified);
      else if (e.key === "Enter") {
        e.preventDefault();
        select(selectedId, true);
      } else if (e.key.startsWith("Arrow") && selected) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        onChangeBox(selectedId, { ...selected.box, x: selected.box.x + dx, y: selected.box.y + dy });
      } else if (e.key === "]" && next) save(next.href);
      else if (e.key === "[" && prev) router.push(prev.href);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [dirty]);

  const status = error
    ? error
    : props.reading
      ? "Reading the page again…"
      : pending
        ? "Saving draft…"
        : dirty
          ? "Editing…"
          : savedAt
            ? submittable && sentBefore
              ? `Draft saved ${savedAt}, not sent for review`
              : `Draft saved ${savedAt}`
            : version > 0
              ? submittable && sentBefore
                ? "Draft saved, not sent for review"
                : "All changes saved"
              : props.source === "prediction"
                ? "OCR draft, not edited yet"
                : "";

  return (
    // overscroll-none: a horizontal touchpad swipe over the canvas must pan, not trigger the
    // browser's back/forward gesture (which flipped to the previous or next page).
    <div className="bg-background flex h-dvh flex-col overscroll-none">
      {/* Top bar */}
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
        {props.document && (
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
            page {props.document.page} of {props.document.pageCount}
          </span>
        )}
        {index >= 0 && (
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
            {(props.position + 1).toLocaleString()}/{props.total.toLocaleString()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden items-center gap-3 pr-1 lg:flex">
            <Toggle
              label="Boxes"
              hint="Show word boxes on the page (V)"
              on={prefs.showBoxes}
              onChange={() => {
                togglePref("showBoxes");
              }}
            />
            <Toggle
              label="Link"
              hint="Line from the selected box to its word (L)"
              on={prefs.showLink}
              onChange={() => {
                togglePref("showLink");
              }}
            />
          </div>
          <div className="hidden items-center gap-0.5 md:flex">
            <ToolButton
              label="Zoom out"
              shortcut="−"
              onClick={() => {
                command("out");
              }}
            >
              <ZoomOut className="size-4" />
            </ToolButton>
            <ToolButton
              label="Zoom in"
              shortcut="+"
              onClick={() => {
                command("in");
              }}
            >
              <ZoomIn className="size-4" />
            </ToolButton>
            <ToolButton
              label="Fit page"
              shortcut="F"
              onClick={() => {
                command("fit");
              }}
            >
              <Maximize className="size-4" />
            </ToolButton>
            <TurnPageButton
              onTurn={(by) => {
                setError(null);
                startTransition(async () => {
                  // Saved labels turn with the page, so they stay on their text.
                  if (version > 0 && props.imageWidth && props.imageHeight) {
                    const w = props.imageWidth;
                    const h = props.imageHeight;
                    const turned = words.map((x) => ({ ...x, box: turnBox(x.box, by, w, h) }));
                    const d = props.document;
                    const page = annotationFromWords(wordsInReadingOrder(lines, turned), d?.page);
                    const saved = await saveAnnotationAction(
                      props.assetId,
                      d ? documentAnnotation(d.otherRegions, page, d.page, d.checkedPages) : page,
                      version,
                    );
                    if (!saved.ok) {
                      setError(saved.error);
                      return;
                    }
                  }
                  const r = await reocrTurnedAction(
                    props.assetId,
                    (props.rotation + by) % 360,
                    props.document?.page ?? 1,
                  );
                  if (!r.ok) setError(r.error);
                  else router.refresh();
                });
              }}
            />
            <ShortcutsButton />
          </div>
          <span
            className={cn(
              "hidden max-w-[220px] truncate text-[12px] whitespace-nowrap md:inline",
              error
                ? "text-destructive"
                : dirty
                  ? "text-[#9a6b00] dark:text-[#E8A400]"
                  : "text-muted-foreground",
            )}
            role="status"
          >
            {status}
          </span>
          <Link
            href={prev?.href ?? "#"}
            aria-disabled={!prev}
            aria-label="Previous page ([)"
            className={cn("hover:bg-muted rounded-md p-1.5", !prev && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <button
            type="button"
            aria-label="Next page (])"
            disabled={!next || pending}
            onClick={() => {
              if (next) save(next.href);
            }}
            className="hover:bg-muted rounded-md p-1.5 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
          {submittable ? (
            <button
              type="button"
              disabled={pending || submitting || version === 0}
              title={version === 0 ? "Edit or check the page first" : "Send this page to reviewers"}
              onClick={() => {
                void submit();
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap disabled:opacity-60"
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
          {next && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                save(next.href);
              }}
              className="hover:bg-muted hidden h-8 items-center gap-1 rounded-md border px-3 text-[13px] font-medium sm:flex"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {props.document && (
          <PageStrip
            assetId={props.assetId}
            page={props.document.page}
            pages={props.document.pages}
            checked={props.document.checkedPages}
            onOpen={(n) => {
              if (props.document && n !== props.document.page) save(props.document.pageHrefBase + String(n));
            }}
          />
        )}
        <SplitFrame storageKey="ol-editor">
          <CanvasStage
            imageUrl={props.imageUrl}
            words={words}
            selectedId={selectedId}
            lineIds={new Set(selectedLine)}
            selectedLabel={
              selected && lineIndex >= 0
                ? `Line ${String(lineIndex + 1)} · ${String(selectedLine.indexOf(selected.id) + 1)}/${String(selectedLine.length)}`
                : null
            }
            handle={canvasRef}
            onSelect={(id) => {
              select(id);
            }}
            onChangeBox={onChangeBox}
            onDraw={onDraw}
            onBoxMenu={openMenu}
            showBoxes={prefs.showBoxes}
            onViewChange={() => {
              setLinkTick((t) => t + 1);
            }}
          />
          <aside className="bg-card flex h-full min-h-0 min-w-0 flex-col">
            <div
              className="flex shrink-0 items-center gap-4 border-b px-4"
              role="tablist"
              aria-label="Inspector"
            >
              {(
                [
                  ["label", "Label"],
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
              {panel === "label" && selected && lineIndex >= 0 && (
                <BoxBar
                  line={lineIndex}
                  lineCount={lines.length}
                  word={selectedLine.indexOf(selected.id)}
                  wordCount={selectedLine.length}
                  onMoveLine={moveLine}
                  onReorder={reorderWord}
                  onSnap={snapSelected}
                  onDelete={() => {
                    remove(selected.id);
                  }}
                />
              )}
            </div>
            {panel === "review" ? (
              <div className="scroll-fade min-h-0 flex-1 overflow-y-auto p-4">
                <ReviewPanel
                  assetId={props.assetId}
                  review={{ ...props.review, currentVersion: version }}
                  reviewers={props.reviewers}
                  canReview={props.canReview}
                  dirty={dirty}
                />
              </div>
            ) : (
              <SplitStack storageKey="ol-editor-right">
                {selected && lineIndex >= 0 ? (
                  <BoxCard
                    word={selected}
                    lineIndex={lineIndex}
                    wordIndex={selectedLine.indexOf(selected.id)}
                    lineText={selectedLine.map((id) => byId.get(id)?.text ?? "").join(" ")}
                    note={note}
                    imageUrl={props.imageUrl}
                    imageWidth={props.imageWidth}
                    imageHeight={props.imageHeight}
                    onText={(t) => {
                      setText(selected.id, t);
                    }}
                    onNext={step}
                    onVerify={(on) => {
                      verify(selected.id, on);
                    }}
                    onRevert={() => {
                      revert(selected.id);
                    }}
                  />
                ) : (
                  <div className="text-muted-foreground grid content-start gap-2 p-4 text-[12px]">
                    <p className="text-foreground text-[13px] font-medium">
                      {words.length === 0
                        ? props.source === "empty"
                          ? "No OCR draft yet"
                          : "No text found on this page"
                        : props.source === "prediction"
                          ? `Drafted by ${props.engine ?? "the OCR model"}`
                          : "Your saved labels"}
                    </p>
                    <p>
                      Click a box or a word to see and fix it. Drag on empty space to draw a box; it snaps to
                      the text and joins its line.
                    </p>
                  </div>
                )}
                <Transcript
                  ref={transcriptRef}
                  lines={lines}
                  byId={byId}
                  selectedId={selectedId}
                  lowCount={lowCount}
                  editedCount={editedCount}
                  onNextLow={nextLow}
                  onSelect={(id) => {
                    select(id);
                  }}
                  onText={setText}
                  onNextLine={(id) => {
                    const li = lines.findIndex((l) => l.includes(id));
                    const first = lines[li + 1]?.[0];
                    if (first) select(first, true);
                  }}
                  onRemove={remove}
                  onMoveLine={(id, dir) => {
                    setSelectedId(id);
                    update(
                      (ws) => ws,
                      (ls, ws) => moveToLine(ls, ws, id, dir),
                    );
                  }}
                  onReorder={(id, dir) => {
                    update(
                      (ws) => ws,
                      (ls) => reorder(ls, id, dir),
                    );
                  }}
                  onMenu={openMenu}
                  onScroll={() => {
                    setLinkTick((t) => t + 1);
                  }}
                />
              </SplitStack>
            )}
          </aside>
        </SplitFrame>
      </div>
      {menu && (
        <BoxMenu
          key={`${menu.id}-${String(menu.x)}-${String(menu.y)}`}
          at={menu}
          inLine={(() => {
            const l = lines.find((x) => x.includes(menu.id)) ?? [];
            return { index: l.indexOf(menu.id), count: l.length };
          })()}
          onClose={() => {
            setMenu(null);
          }}
          onEdit={() => {
            select(menu.id, true);
          }}
          onSnap={snapSelected}
          onZoom={() => {
            command("focus");
          }}
          onMoveLine={moveLine}
          onReorder={reorderWord}
          onDelete={() => {
            remove(menu.id);
          }}
        />
      )}
      <Connector
        tick={linkTick}
        from={() => (selectedId ? (canvasRef.current?.boxOnScreen(selectedId) ?? null) : null)}
        to={() => {
          const el = selectedId
            ? transcriptRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`)
            : null;
          const box = transcriptRef.current?.getBoundingClientRect();
          if (!el || !box) return null;
          const r = el.getBoundingClientRect();
          // End at the panel's edge, level with the word, so the curve doesn't cross the text.
          return r.bottom > box.top && r.top < box.bottom
            ? new DOMRect(box.left + 4, r.top, r.width, r.height)
            : null;
        }}
        enabled={panel === "label" && prefs.showLink}
      />

      {/* Film-strip: other files in this folder; can be tucked away (B). */}
      {props.strip.length > 1 &&
        (stripHidden ? (
          <button
            type="button"
            onClick={() => {
              togglePref("hideFileStrip");
            }}
            className="bg-card text-muted-foreground hover:text-foreground flex h-7 shrink-0 items-center justify-center gap-1.5 border-t text-[11.5px]"
          >
            <ChevronUp className="size-3.5" /> Show files · {props.position + 1} of {props.total}
            <kbd className="font-mono text-[10.5px] opacity-70">B</kbd>
          </button>
        ) : (
          <div className="bg-card relative shrink-0 border-t">
            <div
              ref={stripRef}
              className="scrollbar-none flex h-[84px] gap-2 overflow-x-auto px-3 py-2 pr-12"
              onWheel={(e) => {
                // A mouse wheel scrolls the strip sideways.
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
              }}
            >
              {props.strip.map((s, i) => {
                const current = s.id === props.assetId;
                return (
                  <Link
                    key={s.id}
                    href={s.href}
                    aria-current={current ? "page" : undefined}
                    title={s.name}
                    onClick={(e) => {
                      if (dirty && !current) {
                        e.preventDefault();
                        save(s.href);
                      }
                    }}
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
                      {props.position - index + i + 1}
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
            <button
              type="button"
              aria-label="Hide files (B)"
              title="Hide files (B)"
              onClick={() => {
                togglePref("hideFileStrip");
              }}
              className="bg-card/95 text-muted-foreground hover:text-foreground hover:bg-muted absolute top-2 right-2 grid size-7 place-items-center rounded-md border shadow-sm"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        ))}
    </div>
  );
}

/** Keyboard shortcuts, behind an icon instead of taking screen space. */
function ShortcutsButton() {
  const rows: [string, string][] = [
    ["Drag on empty space", "Draw a box (snaps to the text)"],
    ["Drag a box / handles", "Move / resize"],
    ["Right-click a box or word", "Box actions: edit, snap, move, delete"],
    ["← ↑ → ↓", "Nudge 1px · Shift 10px"],
    ["S", "Snap the box to its text"],
    ["Enter", "Edit the selected word"],
    ["Del", "Delete the box"],
    ["N", "Next word to check"],
    ["C", "Confirm the word is right as read"],
    ["B", "Hide / show the files strip"],
    ["V", "Show / hide word boxes"],
    ["L", "Show / hide the link line"],
    ["Tab / Shift+Tab", "Next / previous word"],
    ["Enter (in text)", "Next line"],
    ["Alt+↑ / Alt+↓", "Move word to line above / below"],
    ["Alt+← / Alt+→", "Reorder in the line"],
    ["Ctrl+scroll · pinch", "Zoom"],
    ["Scroll · Space+drag", "Pan"],
    ["+ / − / F", "Zoom in / out / fit"],
    ["[ / ]", "Previous / next file"],
    ["PgUp / PgDn", "Previous / next page of a PDF"],
    ["Ctrl+S", "Save now"],
  ];
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-8 place-items-center rounded-md"
            >
              <Keyboard className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[340px] p-3">
        <p className="mb-2 text-[13px] font-semibold">Keyboard shortcuts</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="bg-muted rounded border px-1.5 py-px font-mono text-[11px]">{k}</kbd>
              </dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** Canvas (default 70%) and right panel side by side, with a draggable divider that's remembered. */
function SplitFrame({ storageKey, children }: { storageKey: string; children: [ReactNode, ReactNode] }) {
  const [left, setLeft] = useStoredPercent(storageKey, 70, 40, 85);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="relative grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-1"
      style={{ ["--left" as string]: `${String(left)}%` }}
    >
      <div className="relative min-h-0 md:col-start-1 md:row-start-1 md:w-[var(--left)]">{children[0]}</div>
      <div className="relative min-h-0 border-t md:absolute md:inset-y-0 md:right-0 md:left-[var(--left)] md:border-t-0 md:border-l">
        <Divider
          axis="x"
          onMove={(clientX) => {
            const r = ref.current?.getBoundingClientRect();
            if (!r) return;
            const v = Math.min(85, Math.max(40, ((clientX - r.left) / r.width) * 100));
            setLeft(v);
          }}
          onReset={() => {
            setLeft(null);
          }}
        />
        {children[1]}
      </div>
    </div>
  );
}

/** Box card (default 45%) above the transcript, with a draggable divider. */
function SplitStack({ storageKey, children }: { storageKey: string; children: [ReactNode, ReactNode] }) {
  const [top, setTop] = useStoredPercent(storageKey, 45, 20, 80);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="scroll-fade min-h-0 overflow-x-hidden overflow-y-auto"
        style={{ height: `${String(top)}%` }}
      >
        {children[0]}
      </div>
      <div className="relative h-px shrink-0 bg-border">
        <Divider
          axis="y"
          onMove={(_, clientY) => {
            const r = ref.current?.getBoundingClientRect();
            if (!r) return;
            const v = Math.min(80, Math.max(20, ((clientY - r.top) / r.height) * 100));
            setTop(v);
          }}
          onReset={() => {
            setTop(null);
          }}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children[1]}</div>
    </div>
  );
}

function Divider({
  axis,
  onMove,
  onReset,
}: {
  axis: "x" | "y";
  onMove: (clientX: number, clientY: number) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
      }}
      onPointerMove={(e) => {
        if (drag) onMove(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        setDrag(false);
      }}
      onDoubleClick={onReset}
      className={cn(
        "hover:bg-brand absolute z-10 hidden transition-colors md:block",
        drag && "bg-brand",
        axis === "x"
          ? "inset-y-0 -left-[3px] w-[6px] cursor-col-resize"
          : "inset-x-0 -top-[3px] h-[6px] cursor-row-resize",
      )}
    />
  );
}

const STORED = "ol-stored-percent";

/** A panel size in percent, remembered in localStorage (null resets to the default). */
function useStoredPercent(key: string, fallback: number, min: number, max: number) {
  const raw = useSyncExternalStore(
    (notify) => {
      window.addEventListener(STORED, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(STORED, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => localStorage.getItem(key),
    () => null,
  );
  const n = Number(raw);
  const value = raw !== null && n >= min && n <= max ? n : fallback;
  const set = (v: number | null) => {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(Math.round(v * 10) / 10));
    window.dispatchEvent(new Event(STORED));
  };
  return [value, set] as const;
}

/** What you can do with a box, opened by right-clicking it on the page or in the text. */
function BoxMenu({
  at,
  inLine,
  onClose,
  onEdit,
  onSnap,
  onZoom,
  onMoveLine,
  onReorder,
  onDelete,
}: {
  at: { x: number; y: number };
  inLine: { index: number; count: number };
  onClose: () => void;
  onEdit: () => void;
  onSnap: () => void;
  onZoom: () => void;
  onMoveLine: (dir: -1 | 1) => void;
  onReorder: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-px" style={{ left: at.x, top: at.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={2} className="w-56">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit text <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSnap}>
          <Magnet /> Snap to text <DropdownMenuShortcut>S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onZoom}>
          <ScanSearch /> Zoom to box <DropdownMenuShortcut>Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onMoveLine(-1);
          }}
        >
          <ChevronUp /> Move to line above <DropdownMenuShortcut>Alt+↑</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onMoveLine(1);
          }}
        >
          <ChevronDown /> Move to line below <DropdownMenuShortcut>Alt+↓</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={inLine.index <= 0}
          onSelect={() => {
            onReorder(-1);
          }}
        >
          <ChevronLeft /> Earlier in line <DropdownMenuShortcut>Alt+←</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={inLine.index === inLine.count - 1}
          onSelect={() => {
            onReorder(1);
          }}
        >
          <ChevronRight /> Later in line <DropdownMenuShortcut>Alt+→</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete box <DropdownMenuShortcut>Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A small labelled on/off switch for display settings. */
function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={hint}
      onClick={onChange}
      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[12px]"
    >
      <span
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
          on ? "bg-brand" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/**
 * Box actions pinned in the panel header, so they stay in the same place whichever box is
 * selected: move between lines, reorder within the line, snap, delete.
 */
function BoxBar(p: {
  line: number;
  lineCount: number;
  word: number;
  wordCount: number;
  onMoveLine: (dir: -1 | 1) => void;
  onReorder: (dir: -1 | 1) => void;
  onSnap: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-0.5" role="toolbar" aria-label="Selected box">
      <BarButton
        label="Move to the line above (Alt+↑)"
        disabled={p.line === 0}
        onClick={() => {
          p.onMoveLine(-1);
        }}
      >
        <ChevronUp />
      </BarButton>
      <BarButton
        label="Move to the line below (Alt+↓)"
        disabled={p.line === p.lineCount - 1 && p.wordCount === 1}
        onClick={() => {
          p.onMoveLine(1);
        }}
      >
        <ChevronDown />
      </BarButton>
      <BarButton
        label="Earlier in the line (Alt+←)"
        disabled={p.word === 0}
        onClick={() => {
          p.onReorder(-1);
        }}
      >
        <ChevronLeft />
      </BarButton>
      <BarButton
        label="Later in the line (Alt+→)"
        disabled={p.word === p.wordCount - 1}
        onClick={() => {
          p.onReorder(1);
        }}
      >
        <ChevronRight />
      </BarButton>
      <span className="bg-border mx-1 h-4 w-px" />
      <BarButton label="Snap to text (S)" onClick={p.onSnap}>
        <Magnet />
      </BarButton>
      <BarButton label="Delete box (Del)" danger onClick={p.onDelete}>
        <Trash2 />
      </BarButton>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "grid size-7 place-items-center rounded-md [&_svg]:size-3.5 disabled:opacity-35",
            danger
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Read the page again turned another way, when the automatic turn was wrong. The answer is kept as
 * the right orientation for this page, which the project's orientation metrics score models on.
 */
function TurnPageButton({ onTurn }: { onTurn: (by: number) => void }) {
  // Turns are relative to the page as you see it now (degrees counter-clockwise).
  const options = [
    { by: 90, label: "Turn left 90°", icon: RotateCcw },
    { by: 270, label: "Turn right 90°", icon: RotateCw },
    { by: 180, label: "Turn upside down", icon: RefreshCw },
  ];
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Page turned wrong"
              className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-8 place-items-center rounded-md"
            >
              <RotateCw className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Page the wrong way up? Turn it and read again</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <p className="text-muted-foreground px-2 py-1.5 text-[12px]">
          Turns the page and reads it again. Boxes you saved turn with it; your answer also scores the
          orientation model.
        </p>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.by}
            onSelect={() => {
              onTurn(o.by);
            }}
          >
            <o.icon /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
