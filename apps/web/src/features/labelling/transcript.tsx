"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { needsCheck, wordState, type EditableWord } from "./regions";

/**
 * The page's text, line by line. Every word is its own small field, so clicking one selects and
 * edits exactly that word. Keys: Tab / Shift+Tab move between words, Enter jumps to the next line,
 * Alt+arrows move a word between lines or within one, emptying a word and pressing Delete removes it.
 */
export const Transcript = forwardRef<
  HTMLDivElement,
  {
    lines: string[][];
    byId: Map<string, EditableWord>;
    selectedId: string | null;
    lowCount: number;
    /** Words whose text differs from what the OCR read (exact, case-sensitive). */
    editedCount: number;
    /** Jump to the next word the OCR wasn't sure about. */
    onNextLow: () => void;
    onSelect: (id: string) => void;
    onText: (id: string, text: string) => void;
    onNextLine: (id: string) => void;
    onRemove: (id: string) => void;
    onMoveLine: (id: string, dir: -1 | 1) => void;
    onReorder: (id: string, dir: -1 | 1) => void;
    onScroll: () => void;
    onMenu: (id: string, clientX: number, clientY: number) => void;
  }
>(function Transcript(p, ref) {
  const words = p.lines.reduce((n, l) => n + l.length, 0);
  return (
    <>
      <div className="text-muted-foreground flex shrink-0 items-center justify-between px-3.5 pt-2.5 pb-1.5 text-[11px] font-semibold">
        <span>TEXT · click a word to edit it</span>
        <span className="tabular-nums">
          {p.lines.length} lines · {words} words
          {p.editedCount > 0 && (
            <span className="text-[#b45309] dark:text-[#f59e0b]"> · {p.editedCount} corrected</span>
          )}
          {p.lowCount > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={p.onNextLow}
                title="Go to the next word to check (N)"
                className="text-[#9a6b00] underline-offset-2 hover:underline dark:text-[#e8a400]"
              >
                {p.lowCount} to check
              </button>
            </>
          )}
        </span>
      </div>
      <div
        ref={ref}
        onScroll={p.onScroll}
        className="scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 pb-3"
      >
        {p.lines.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-[12px]">
            No text yet. Drag on the page around some text to add a box.
          </p>
        )}
        {p.lines.map((line, li) => {
          const active = p.selectedId !== null && line.includes(p.selectedId);
          return (
            <div
              key={line[0] ?? li}
              className={cn(
                "grid grid-cols-[26px_minmax(0,1fr)] items-start rounded-md py-0.5",
                active && "bg-brand/8",
              )}
            >
              <span className="text-muted-foreground pt-1.5 pr-1.5 text-right font-mono text-[11px] tabular-nums">
                {li + 1}
              </span>
              <div className="flex flex-wrap gap-[3px]">
                {line.map((id) => {
                  const w = p.byId.get(id);
                  if (!w) return null;
                  const state = wordState(w);
                  const low = needsCheck(w);
                  return (
                    <span key={id} className="relative inline-flex max-w-full">
                      <input
                        data-id={id}
                        title={state === "edited" ? `OCR read “${w.ocrText ?? ""}”` : undefined}
                        value={w.text}
                        spellCheck={false}
                        autoComplete="off"
                        aria-label={`Line ${String(li + 1)}: ${w.text || "empty word"}${state === "edited" ? ", corrected" : state === "verified" ? ", confirmed" : ""}`}
                        onFocus={() => {
                          if (p.selectedId !== id) p.onSelect(id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          p.onSelect(id);
                          p.onMenu(id, e.clientX, e.clientY);
                        }}
                        onChange={(e) => {
                          p.onText(id, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          const k = e.key;
                          if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) {
                            e.preventDefault();
                            p.onMoveLine(id, k === "ArrowUp" ? -1 : 1);
                          } else if (e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) {
                            e.preventDefault();
                            p.onReorder(id, k === "ArrowLeft" ? -1 : 1);
                          } else if (k === "Enter") {
                            e.preventDefault();
                            p.onNextLine(id);
                          } else if ((k === "Backspace" || k === "Delete") && w.text === "") {
                            e.preventDefault();
                            p.onRemove(id);
                          } else if (k === "Escape") e.currentTarget.blur();
                        }}
                        className={cn(
                          "hover:bg-muted field-sizing-content max-w-full min-w-[3ch] rounded border border-transparent bg-transparent px-1.5 py-[3px] font-mono text-[13px] outline-none",
                          "focus:border-brand focus:bg-background",
                          low &&
                            "text-[#9a6b00] underline decoration-dashed underline-offset-[3px] dark:text-[#e8a400]",
                          state === "drawn" && "text-[#a855f7] dark:text-[#c084fc]",
                          state === "edited" &&
                            "text-[#b45309] underline decoration-[#d97706] decoration-2 underline-offset-[3px] dark:text-[#f59e0b]",
                          p.selectedId === id && "border-brand bg-brand/15",
                        )}
                      />
                      {state === "verified" && (
                        <span
                          aria-hidden
                          className="bg-success pointer-events-none absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
});
