"use client";
import { ChevronLeft, ChevronRight, MousePointer2, Save, Square, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/features/auth";
import { cn } from "@/lib/utils";
import { saveAnnotationAction } from "@/server/projects/actions";
import type { Tool } from "./canvas-stage";
import { annotationFromWords, LOW_CONFIDENCE, type Box, type EditableWord } from "./regions";

// Konva needs the browser; never render it on the server.
const CanvasStage = dynamic(() => import("./canvas-stage").then((m) => m.CanvasStage), { ssr: false });

export interface EditorProps {
  assetId: string;
  assetName: string;
  imageUrl: string;
  initialWords: EditableWord[];
  baseVersion: number;
  source: "annotation" | "prediction" | "empty";
  engine: string | null;
  prevHref: string | null;
  nextHref: string | null;
  backHref: string;
}

/** Labelling workspace: canvas on the left, word list with text editing on the right. */
export function Editor(props: EditorProps) {
  const router = useRouter();
  const [words, setWords] = useState(props.initialWords);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(props.baseVersion);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const selected = useMemo(() => words.find((w) => w.id === selectedId) ?? null, [words, selectedId]);
  const lowCount = words.filter((w) => w.conf !== null && w.conf < LOW_CONFIDENCE).length;

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
        setSavedAt(new Date().toLocaleTimeString());
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
    update((ws) => ws.filter((w) => w.id !== id));
    setSelectedId(null);
  }

  function step(delta: 1 | -1) {
    const i = words.findIndex((w) => w.id === selectedId);
    const next = words[Math.min(Math.max(i + delta, 0), words.length - 1)];
    if (next) setSelectedId(next.id);
  }

  // Keep the selected word visible in the list.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

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
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          step(e.shiftKey ? -1 : 1);
        } else if (e.key === "Escape") {
          e.target.blur();
        }
        return;
      }
      if (e.key === "b") setTool("draw");
      else if (e.key === "v" || e.key === "Escape") {
        setTool("select");
        if (e.key === "Escape") setSelectedId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) remove(selectedId);
      else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        textRef.current?.focus();
      } else if (e.key === "j" || e.key === "ArrowDown") step(1);
      else if (e.key === "k" || e.key === "ArrowUp") step(-1);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="bg-card flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={props.backHref}>
            <ChevronLeft aria-hidden />
            Assets
          </Link>
        </Button>
        <span className="text-muted-foreground hidden max-w-[260px] truncate font-mono text-[12px] sm:inline">
          {props.assetName}
        </span>
        <div className="bg-muted ml-2 flex rounded-md p-0.5" role="group" aria-label="Tool">
          <Button
            size="sm"
            variant={tool === "select" ? "secondary" : "ghost"}
            className={cn("h-7", tool === "select" && "bg-card shadow-sm")}
            onClick={() => {
              setTool("select");
            }}
            title="Select and move (V)"
          >
            <MousePointer2 aria-hidden />
            <span className="hidden md:inline">Select</span>
          </Button>
          <Button
            size="sm"
            variant={tool === "draw" ? "secondary" : "ghost"}
            className={cn("h-7", tool === "draw" && "bg-card shadow-sm")}
            onClick={() => {
              setTool("draw");
            }}
            title="Draw a box (B)"
          >
            <Square aria-hidden />
            <span className="hidden md:inline">Draw box</span>
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground hidden text-[12px] lg:inline">
            {dirty
              ? "Unsaved changes"
              : savedAt
                ? `Saved ${savedAt}`
                : version > 0
                  ? `Version ${String(version)}`
                  : ""}
          </span>
          <Button size="sm" variant="ghost" disabled={!props.prevHref} asChild={!!props.prevHref}>
            {props.prevHref ? (
              <Link href={props.prevHref} aria-label="Previous asset">
                <ChevronLeft aria-hidden />
              </Link>
            ) : (
              <span aria-hidden>
                <ChevronLeft />
              </span>
            )}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              save();
            }}
          >
            <Save aria-hidden />
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !props.nextHref}
            onClick={() => {
              if (props.nextHref) save(props.nextHref);
            }}
            title="Save and open the next asset"
          >
            Save & next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,40%)] lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1">
        <CanvasStage
          imageUrl={props.imageUrl}
          words={words}
          selectedId={selectedId}
          tool={tool}
          onSelect={setSelectedId}
          onChangeBox={(id, box) => {
            update((ws) => ws.map((w) => (w.id === id ? { ...w, box, conf: null } : w)));
          }}
          onDraw={onDraw}
        />

        {/* Side panel */}
        <aside className="bg-card flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <div className="border-b p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Words</p>
              <div className="flex gap-1.5">
                <Badge variant="secondary">{words.length}</Badge>
                {lowCount > 0 && (
                  <Badge variant="outline" className="border-[#D9480F]/40 text-[#D9480F]">
                    {lowCount} to check
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-[12px]">
              {props.source === "prediction"
                ? `Drafted by ${props.engine ?? "the OCR model"}. Correct anything wrong, then save.`
                : props.source === "annotation"
                  ? "Your saved labels."
                  : "No OCR draft yet. Draw boxes, or wait for pre-labelling."}
            </p>
            {selected ? (
              <div className="mt-4 grid gap-2">
                <label htmlFor="word-text" className="text-[12px] font-medium">
                  Text of selected box
                </label>
                <div className="flex gap-2">
                  <Input
                    id="word-text"
                    ref={textRef}
                    value={selected.text}
                    className="h-10 font-mono text-[15px]"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => {
                      const text = e.target.value;
                      update((ws) => ws.map((w) => (w.id === selected.id ? { ...w, text, conf: null } : w)));
                    }}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-10"
                    aria-label="Delete box"
                    onClick={() => {
                      remove(selected.id);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Enter: next word · Shift+Enter: previous · Esc: back to canvas
                  {selected.conf !== null && ` · model confidence ${selected.conf.toFixed(2)}`}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground mt-4 text-[12px]">
                Click a box to edit it. <kbd className="font-mono">B</kbd> draws a new box,{" "}
                <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> step through words,{" "}
                <kbd className="font-mono">Ctrl+S</kbd> saves. Scroll to zoom, drag to pan.
              </p>
            )}
            <div className="mt-3">
              <FormError message={error} />
            </div>
          </div>
          <ol ref={listRef} className="scrollbar-none min-h-0 flex-1 overflow-y-auto py-1">
            {words.map((w, i) => {
              const low = w.conf !== null && w.conf < LOW_CONFIDENCE;
              return (
                <li key={w.id} data-id={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(w.id);
                    }}
                    className={cn(
                      "hover:bg-muted flex w-full items-center gap-3 px-4 py-1.5 text-left",
                      w.id === selectedId && "bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <span className="text-muted-foreground w-7 shrink-0 text-right font-mono text-[11px] tabular-nums">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-mono text-[13px]",
                        !w.text && "italic opacity-50",
                      )}
                    >
                      {w.text || "empty"}
                    </span>
                    {low && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-[#D9480F]"
                        aria-label="Low confidence"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
