"use client";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Hand,
  Maximize,
  MousePointer2,
  Save,
  ScanSearch,
  Square,
  Trash2,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { saveAnnotationAction } from "@/server/projects/actions";
import type { CanvasHandle, Tool } from "./canvas-stage";
import { annotationFromWords, LOW_CONFIDENCE, type Box, type EditableWord } from "./regions";
import { WordZoom } from "./word-zoom";

// Konva needs the browser; never render it on the server.
const CanvasStage = dynamic(() => import("./canvas-stage").then((m) => m.CanvasStage), { ssr: false });

export interface StripItem {
  id: string;
  name: string;
  href: string;
  done: boolean;
}

export interface EditorProps {
  assetId: string;
  assetName: string;
  projectName: string;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  initialWords: EditableWord[];
  baseVersion: number;
  source: "annotation" | "prediction" | "empty";
  engine: string | null;
  backHref: string;
  /** Pages in the current folder, in order, for the film-strip and prev/next. */
  strip: StripItem[];
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const canvasRef = useRef<CanvasHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(props.baseVersion);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const index = props.strip.findIndex((s) => s.id === props.assetId);
  const prev = index > 0 ? props.strip[index - 1] : undefined;
  const next = index >= 0 && index < props.strip.length - 1 ? props.strip[index + 1] : undefined;

  const selected = useMemo(() => words.find((w) => w.id === selectedId) ?? null, [words, selectedId]);
  const isLow = (w: EditableWord) => w.conf !== null && w.conf < LOW_CONFIDENCE;
  const lowCount = words.filter(isLow).length;
  const listed = onlyLow ? words.filter(isLow) : words;

  const command = (kind: Parameters<CanvasHandle["zoom"]>[0]) => {
    canvasRef.current?.zoom(kind);
  };

  const update = useCallback((fn: (ws: EditableWord[]) => EditableWord[]) => {
    setWords(fn);
    setDirty(true);
  }, []);

  const save = useCallback(
    (then?: string) => {
      setError(null);
      startTransition(async () => {
        const result = await saveAnnotationAction(props.assetId, annotationFromWords(words), version);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setVersion(result.data.version);
        setDirty(false);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        if (then) router.push(then);
        else router.refresh();
      });
    },
    [props.assetId, words, version, router],
  );

  function onDraw(box: Box) {
    const id = `u${Date.now().toString(36)}`;
    update((ws) => [...ws, { id, text: "", box, conf: null }]);
    setSelectedId(id);
    setTool("select");
    requestAnimationFrame(() => textRef.current?.focus());
  }

  function remove(id: string) {
    const i = words.findIndex((w) => w.id === id);
    update((ws) => ws.filter((w) => w.id !== id));
    setSelectedId(words[i + 1]?.id ?? words[i - 1]?.id ?? null);
  }

  function step(delta: 1 | -1) {
    const pool = listed;
    const i = pool.findIndex((w) => w.id === selectedId);
    const target = pool[i === -1 ? 0 : Math.min(Math.max(i + delta, 0), pool.length - 1)];
    if (target) setSelectedId(target.id);
  }

  /** Marks the selected word as checked (clears its low-confidence flag) and moves on. */
  function accept() {
    if (!selected) return;
    update((ws) => ws.map((w) => (w.id === selected.id ? { ...w, conf: null } : w)));
    step(1);
  }

  // Keep the selected word visible in the list, and the current page visible in the strip.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (typing) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) step(-1);
          else accept();
        } else if (e.key === "Tab") {
          e.preventDefault();
          step(e.shiftKey ? -1 : 1);
        } else if (e.key === "Escape") {
          e.target.blur();
        }
        return;
      }
      if (e.key === "v") setTool("select");
      else if (e.key === "h") setTool("pan");
      else if (e.key === "b") setTool("draw");
      else if (e.key === "f") command("fit");
      else if (e.key === "z" && selectedId) command("focus");
      else if (e.key === "+" || e.key === "=") command("in");
      else if (e.key === "-") command("out");
      else if (e.key === "Escape") {
        setTool("select");
        setSelectedId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) remove(selectedId);
      else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        textRef.current?.focus();
      } else if (e.key === "j" || e.key === "ArrowDown") step(1);
      else if (e.key === "k" || e.key === "ArrowUp") step(-1);
      else if (e.key === "]" && next) save(next.href);
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
    : dirty
      ? "Unsaved changes"
      : savedAt
        ? `Saved ${savedAt}`
        : version > 0
          ? `Version ${String(version)}`
          : props.source === "prediction"
            ? "OCR draft"
            : "";

  return (
    <div className="bg-background flex h-dvh flex-col">
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
        {index >= 0 && (
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
            {index + 1}/{props.strip.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "hidden text-[12px] md:inline",
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
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              save();
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium disabled:opacity-60"
          >
            <Save className="size-3.5" />
            {pending ? "Saving…" : "Save"}
          </button>
          {next && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                save(next.href);
              }}
              className="hover:bg-muted hidden h-8 items-center gap-1 rounded-md border px-3 text-[13px] font-medium sm:flex"
            >
              Save & next <ChevronRight className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1">
        {/* Canvas + floating palette */}
        <div className="relative min-h-0">
          <CanvasStage
            imageUrl={props.imageUrl}
            words={words}
            selectedId={selectedId}
            tool={tool}
            handle={canvasRef}
            onSelect={setSelectedId}
            onChangeBox={(id, box) => {
              update((ws) => ws.map((w) => (w.id === id ? { ...w, box, conf: null } : w)));
            }}
            onDraw={onDraw}
          />
          <div className="bg-card/95 absolute top-3 left-3 flex flex-col gap-1 rounded-lg border p-1 shadow-sm backdrop-blur">
            <ToolButton
              label="Select and edit"
              shortcut="V"
              active={tool === "select"}
              onClick={() => {
                setTool("select");
              }}
            >
              <MousePointer2 className="size-4" />
            </ToolButton>
            <ToolButton
              label="Pan"
              shortcut="H"
              active={tool === "pan"}
              onClick={() => {
                setTool("pan");
              }}
            >
              <Hand className="size-4" />
            </ToolButton>
            <ToolButton
              label="Draw a box"
              shortcut="B"
              active={tool === "draw"}
              onClick={() => {
                setTool("draw");
              }}
            >
              <Square className="size-4" />
            </ToolButton>
            <div className="bg-border mx-1.5 my-0.5 h-px" />
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
              label="Zoom out"
              shortcut="−"
              onClick={() => {
                command("out");
              }}
            >
              <ZoomOut className="size-4" />
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
            <ToolButton
              label="Zoom to selected word"
              shortcut="Z"
              onClick={() => {
                if (selectedId) command("focus");
              }}
            >
              <ScanSearch className="size-4" />
            </ToolButton>
            <div className="bg-border mx-1.5 my-0.5 h-px" />
            <ToolButton
              label="Delete box"
              shortcut="Del"
              onClick={() => {
                if (selectedId) remove(selectedId);
              }}
            >
              <Trash2 className="size-4" />
            </ToolButton>
          </div>
        </div>

        {/* Inspector */}
        <aside className="bg-card flex max-h-[45dvh] min-h-0 min-w-0 flex-col border-t md:max-h-none md:border-t-0 md:border-l">
          <div className="grid gap-3 border-b p-4">
            {selected ? (
              <>
                <WordZoom
                  imageUrl={props.imageUrl}
                  box={selected.box}
                  imageWidth={props.imageWidth}
                  imageHeight={props.imageHeight}
                />
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="word-text" className="text-[12px] font-medium">
                      Text
                    </label>
                    {selected.conf !== null && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[11px] tabular-nums",
                          isLow(selected) ? "text-[#D9480F]" : "text-muted-foreground",
                        )}
                      >
                        {isLow(selected) && <TriangleAlert className="size-3" />}
                        OCR {Math.round(selected.conf * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      id="word-text"
                      ref={textRef}
                      value={selected.text}
                      className="h-10 font-mono text-[15px]"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        const text = e.target.value;
                        update((ws) =>
                          ws.map((w) => (w.id === selected.id ? { ...w, text, conf: null } : w)),
                        );
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Correct, next word (Enter)"
                      title="Correct, next word (Enter)"
                      onClick={accept}
                      className="hover:bg-muted grid size-10 shrink-0 place-items-center rounded-md border"
                    >
                      <Check className="size-4" />
                    </button>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Enter: correct, next · Tab: skip · Shift+Enter: back · Z: zoom to word
                  </p>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground grid gap-2 py-2 text-[12px]">
                <p className="text-foreground text-[13px] font-medium">
                  {props.source === "prediction"
                    ? `Drafted by ${props.engine ?? "the OCR model"}`
                    : props.source === "annotation"
                      ? "Your saved labels"
                      : "No OCR draft yet"}
                </p>
                <p>
                  Click a box or a word below. <kbd className="font-mono">J</kbd>/
                  <kbd className="font-mono">K</kbd> step through words, <kbd className="font-mono">B</kbd>{" "}
                  draws a box, <kbd className="font-mono">]</kbd> saves and opens the next page.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[12px]">
            <span className="font-medium">Words</span>
            <span className="text-muted-foreground tabular-nums">{words.length}</span>
            <button
              type="button"
              onClick={() => {
                setOnlyLow(!onlyLow);
              }}
              disabled={lowCount === 0 && !onlyLow}
              className={cn(
                "ml-auto rounded-full border px-2 py-0.5 tabular-nums disabled:opacity-40",
                onlyLow ? "border-[#D9480F] bg-[#D9480F]/10 text-[#D9480F]" : "text-muted-foreground",
              )}
            >
              {lowCount} to check
            </button>
          </div>
          <ol ref={listRef} className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-2">
            {listed.map((w) => (
              <li key={w.id} data-id={w.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(w.id);
                  }}
                  className={cn(
                    "hover:bg-muted flex w-full items-center gap-2 px-4 py-1 text-left",
                    w.id === selectedId && "bg-accent text-accent-foreground hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      isLow(w) ? "bg-[#D9480F]" : "bg-transparent",
                    )}
                    aria-label={isLow(w) ? "Needs checking" : undefined}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-[13px]",
                      !w.text && "italic opacity-50",
                    )}
                  >
                    {w.text || "empty"}
                  </span>
                </button>
              </li>
            ))}
            {listed.length === 0 && (
              <li className="text-muted-foreground px-4 py-6 text-center text-[12px]">
                {onlyLow ? "Nothing left to check on this page." : "No words yet. Press B and draw a box."}
              </li>
            )}
          </ol>
        </aside>
      </div>

      {/* Film-strip */}
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
