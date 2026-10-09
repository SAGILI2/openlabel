"use client";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ClassItem {
  /** Present for classes that already exist; new ones get a key from their name on save. */
  key?: string;
  name: string;
}

/**
 * Edits an ordered list of classes. The first nine get number hotkeys in the labelling screen,
 * so order matters and is shown.
 */
export function ClassListEditor({
  value,
  onChange,
  disabled,
}: {
  value: ClassItem[];
  onChange: (next: ClassItem[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function add() {
    // Paste a comma- or newline-separated list to add many at once.
    const names = draft
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    const existing = new Set(value.map((c) => c.name.toLowerCase()));
    const fresh = names.filter((n) => !existing.has(n.toLowerCase()));
    if (fresh.length > 0) onChange([...value, ...fresh.map((name) => ({ name }))]);
    setDraft("");
    input.current?.focus();
  }

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    onChange(next);
  }

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ol className="divide-y rounded-md border">
          {value.map((c, i) => (
            <li key={c.key ?? `new-${c.name}`} className="flex items-center gap-2 px-2 py-1.5">
              <kbd className="text-muted-foreground w-5 text-center font-mono text-[11px] tabular-nums">
                {i < 9 ? i + 1 : ""}
              </kbd>
              <Input
                value={c.name}
                disabled={disabled}
                aria-label={`Class ${String(i + 1)} name`}
                onChange={(e) => {
                  onChange(value.map((v, k) => (k === i ? { ...v, name: e.target.value } : v)));
                }}
                className="h-8 flex-1 text-[13px]"
              />
              <button
                type="button"
                aria-label="Move up"
                disabled={disabled || i === 0}
                onClick={() => {
                  move(i, -1);
                }}
                className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={disabled || i === value.length - 1}
                onClick={() => {
                  move(i, 1);
                }}
                className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((_, k) => k !== i));
                }}
                className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            ref={input}
            value={draft}
            placeholder={value.length === 0 ? "e.g. invoice, receipt, contract" : "Add a class"}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-9 text-[13px]"
            aria-label="New class name"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus aria-hidden /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
