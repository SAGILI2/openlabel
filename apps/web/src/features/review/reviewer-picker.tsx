"use client";
import { Check, Settings2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ReviewerOption {
  userId: string;
  name: string;
  email: string;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

export function ReviewerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-6", className)}>
      <AvatarFallback className="bg-muted text-[10px] font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** "Reviewers ⚙" picker, like on a pull request: search and tick people; applies on close. */
export function ReviewerPicker({
  options,
  selected,
  onChange,
  disabled,
  trigger,
}: {
  options: ReviewerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(selected);
  const visible = options.filter((o) =>
    `${o.name} ${o.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(selected);
          setQuery("");
        } else if (draft.join() !== selected.join()) {
          onChange(draft);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between rounded-md text-[12px] font-medium disabled:opacity-50"
      >
        {trigger ?? "Reviewers"}
        <Settings2 className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Type to filter people"
            className="placeholder:text-muted-foreground w-full bg-transparent px-1.5 py-1 text-[13px] outline-none"
          />
        </div>
        <p className="text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-medium">
          Request up to 20 reviewers
        </p>
        <ul className="max-h-64 overflow-y-auto pb-1">
          {visible.map((o) => {
            const on = draft.includes(o.userId);
            return (
              <li key={o.userId}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(on ? draft.filter((id) => id !== o.userId) : [...draft, o.userId]);
                  }}
                  className="hover:bg-muted flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
                >
                  <Check className={cn("size-3.5 shrink-0", !on && "invisible")} aria-hidden />
                  <ReviewerAvatar name={o.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">{o.name}</span>
                    <span className="text-muted-foreground block truncate text-[11px]">{o.email}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="text-muted-foreground px-3 py-3 text-[12px]">
              Nobody matches. Reviewers need the reviewer role or higher.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
