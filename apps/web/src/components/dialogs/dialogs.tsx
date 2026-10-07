"use client";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Return an error message to keep the dialog open, or null when the value is fine. */
  validate?: (value: string) => string | null;
}

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

interface DialogsApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogsContext = createContext<DialogsApi | null>(null);

/** In-app replacements for window.confirm / window.prompt, styled like the rest of the UI. */
export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext);
  if (!api) throw new Error("useDialogs must be used inside <DialogsProvider>");
  return api;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: "confirm", options, resolve });
      }),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(options.defaultValue ?? "");
        setError(null);
        setPending({ kind: "prompt", options, resolve });
      }),
    [],
  );

  function close(result: boolean) {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(result);
    else pending.resolve(result ? value.trim() : null);
    setPending(null);
  }

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending?.kind !== "prompt") return;
    const trimmed = value.trim();
    const problem = trimmed ? (pending.options.validate?.(trimmed) ?? null) : "Enter a value.";
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    close(true);
  }

  const options = pending?.options;
  return (
    <DialogsContext.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <DialogContent className="sm:max-w-[420px]" showCloseButton={false}>
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>{options?.title}</DialogTitle>
              {options?.description && <DialogDescription>{options.description}</DialogDescription>}
            </DialogHeader>
            {pending?.kind === "prompt" && (
              <div className="grid gap-1.5">
                <Label htmlFor="dialog-prompt">{pending.options.label}</Label>
                <Input
                  id="dialog-prompt"
                  ref={inputRef}
                  value={value}
                  placeholder={pending.options.placeholder}
                  autoFocus
                  autoComplete="off"
                  className="h-10"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "dialog-prompt-error" : undefined}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                />
                {error && (
                  <p id="dialog-prompt-error" className="text-destructive text-[12px]">
                    {error}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={
                  pending?.kind === "confirm" && pending.options.destructive ? "destructive" : "default"
                }
                autoFocus={pending?.kind === "confirm"}
                onClick={
                  pending?.kind === "confirm"
                    ? () => {
                        close(true);
                      }
                    : undefined
                }
              >
                {options?.confirmLabel ?? "OK"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DialogsContext.Provider>
  );
}
