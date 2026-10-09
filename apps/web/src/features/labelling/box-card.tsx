"use client";
import { Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOW_CONFIDENCE, wordState, type EditableWord } from "./regions";
import { WordZoom } from "./word-zoom";

/**
 * Details of the selected box: a crop, its text, confidence, size and position. Moving it
 * between lines, snapping and deleting sit in the panel header (BoxBar) so they never move.
 */
export function BoxCard({
  word,
  lineIndex,
  wordIndex,
  lineText,
  note,
  imageUrl,
  imageWidth,
  imageHeight,
  onText,
  onNext,
  onVerify,
  onRevert,
}: {
  word: EditableWord;
  lineIndex: number;
  wordIndex: number;
  lineText: string;
  note: string | null;
  imageUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
  onText: (text: string) => void;
  onNext: (dir: 1 | -1) => void;
  onVerify: (on: boolean) => void;
  onRevert: () => void;
}) {
  const state = wordState(word);
  const drawn = state === "drawn";
  const low = word.conf !== null && word.conf < LOW_CONFIDENCE;
  const pct = word.conf === null ? null : Math.round(word.conf * 100);
  return (
    <div className="grid content-start gap-2.5 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">
          Line {lineIndex + 1} · word {wordIndex + 1}
        </span>
        <StateBadge state={state} />
      </div>
      {note && <p className="text-[12px] text-[#a855f7] dark:text-[#c084fc]">{note}</p>}
      <WordZoom imageUrl={imageUrl} box={word.box} imageWidth={imageWidth} imageHeight={imageHeight} />
      <input
        value={word.text}
        aria-label="Text of the selected box"
        placeholder="Type the text in this box"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          onText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onNext(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") e.currentTarget.blur();
        }}
        className={cn(
          "bg-background focus:border-brand h-10 w-full rounded-md border px-3 font-mono text-[15px] outline-none",
          state === "edited" && "border-[#d97706]/60",
        )}
      />
      {state === "edited" && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted-foreground shrink-0">OCR read</span>
          <span className="bg-muted min-w-0 truncate rounded px-1.5 py-0.5 font-mono line-through decoration-[#d97706]/70">
            {word.ocrText || "(nothing)"}
          </span>
          <button
            type="button"
            onClick={onRevert}
            className="text-muted-foreground hover:text-foreground ml-auto flex shrink-0 items-center gap-1"
          >
            <Undo2 className="size-3.5" /> Undo
          </button>
        </div>
      )}
      {(state === "ocr" || state === "verified") && (
        <button
          type="button"
          onClick={() => {
            onVerify(state !== "verified");
          }}
          aria-pressed={state === "verified"}
          className={cn(
            "flex h-7 w-fit items-center gap-1.5 rounded-md border px-2.5 text-[12px]",
            state === "verified"
              ? "border-success/40 bg-success/10 text-success"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <Check className="size-3.5" />
          {state === "verified" ? "Confirmed correct" : "Mark correct"}
          <kbd className="font-mono text-[10.5px] opacity-70">C</kbd>
        </button>
      )}
      <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-muted-foreground">Confidence</dt>
        <dd className={cn("tabular-nums", low && "text-[#9a6b00] dark:text-[#e8a400]")}>
          {drawn || pct === null ? "—" : `${String(pct)}%`}
        </dd>
        <dt className="text-muted-foreground">Size</dt>
        <dd className="tabular-nums">
          {Math.round(word.box.width)} × {Math.round(word.box.height)} px
        </dd>
        <div className="bg-border col-span-4 my-0.5 h-1 overflow-hidden rounded-full">
          <i
            className={cn("block h-full", drawn ? "bg-[#c084fc]" : low ? "bg-[#e8a400]" : "bg-success")}
            style={{ width: `${String(drawn || pct === null ? 100 : pct)}%` }}
          />
        </div>
        <dt className="text-muted-foreground">Position</dt>
        <dd className="tabular-nums">
          x {Math.round(word.box.x)}, y {Math.round(word.box.y)}
        </dd>
        <dt className="text-muted-foreground">Line</dt>
        <dd className="truncate font-mono" title={lineText}>
          {lineText}
        </dd>
      </dl>
    </div>
  );
}

const STATE_LABEL = {
  ocr: { text: "from OCR", className: "text-muted-foreground" },
  edited: { text: "corrected", className: "bg-[#d97706]/12 text-[#b45309] dark:text-[#f59e0b]" },
  verified: { text: "confirmed", className: "bg-success/12 text-success" },
  drawn: { text: "drawn by you", className: "bg-[#a855f7]/12 text-[#9333ea] dark:text-[#c084fc]" },
} as const;

function StateBadge({ state }: { state: keyof typeof STATE_LABEL }) {
  const s = STATE_LABEL[state];
  return <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", s.className)}>{s.text}</span>;
}
