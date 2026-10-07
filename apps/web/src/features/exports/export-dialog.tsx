"use client";
import { PackagePlus } from "lucide-react";
import { useState, useTransition, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormError, FormField } from "@/features/auth";
import { cn } from "@/lib/utils";
import { createExportAction } from "@/server/projects/actions";

export interface FormatOption {
  id: string;
  title: string;
  description: string;
}

function SplitInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[12px]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          value={value}
          className="h-9 pr-7 tabular-nums"
          onChange={(e) => {
            onChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)));
          }}
        />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px]">
          %
        </span>
      </div>
    </div>
  );
}

/** Create an export: name, format, split percentages and crop padding. */
export function ExportDialog({
  projectId,
  formats,
  labelledCount,
  inReviewCount = 0,
  folders = [],
}: {
  projectId: string;
  formats: FormatOption[];
  labelledCount: number;
  /** Pages waiting for review, offered as an opt-in. */
  inReviewCount?: number;
  /** Folders that can be exported on their own (with their sub-folders). */
  folders?: { id: string; path: string }[];
}) {
  const [folderId, setFolderId] = useState<string>("all");
  const [include, setInclude] = useState<"approved" | "reviewed">("approved");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`Export ${new Date().toISOString().slice(0, 10)}`);
  const [format, setFormat] = useState(formats[0]?.id ?? "");
  const [split, setSplit] = useState({ train: 80, val: 10, test: 10 });
  const [padding, setPadding] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = split.train + split.val + split.test;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createExportAction({
        projectId,
        name,
        format,
        ...split,
        cropPadding: padding,
        folderId: folderId === "all" ? null : folderId,
        include,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  const pageCount = include === "reviewed" ? labelledCount + inReviewCount : labelledCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={labelledCount === 0}
          title={labelledCount === 0 ? "Label and save an item first" : undefined}
        >
          <PackagePlus aria-hidden />
          New export
        </Button>
      </DialogTrigger>
      {/* Wide, two columns on larger screens; header and footer stay put while the middle scrolls. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle>Export training data</DialogTitle>
          <DialogDescription>
            Freezes the current labels of {labelledCount} labelled {labelledCount === 1 ? "page" : "pages"}.
            Later edits won&apos;t change this export.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="grid content-start gap-5">
              <FormField
                id="export-name"
                label="Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
              <div className="grid gap-2">
                <Label id="export-include-label">Include</Label>
                <RadioGroup
                  value={include}
                  onValueChange={(v) => {
                    setInclude(v === "reviewed" ? "reviewed" : "approved");
                  }}
                  aria-labelledby="export-include-label"
                  className="gap-1.5"
                >
                  {(
                    [
                      ["approved", "Approved pages only", labelledCount],
                      ["reviewed", "Approved + waiting for review", labelledCount + inReviewCount],
                    ] as const
                  ).map(([value, title, n]) => (
                    <label
                      key={value}
                      htmlFor={`include-${value}`}
                      className="flex cursor-pointer items-center gap-2.5 text-[13px]"
                    >
                      <RadioGroupItem id={`include-${value}`} value={value} />
                      <span className="flex-1">{title}</span>
                      <span className="text-muted-foreground tabular-nums">{n}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              {folders.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="export-folder">What to export</Label>
                  <Select value={folderId} onValueChange={setFolderId}>
                    <SelectTrigger id="export-folder" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Whole project</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.path} <span className="text-muted-foreground">and sub-folders</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <p className="text-sm font-medium">Split (by page)</p>
                <div className="grid grid-cols-3 gap-3">
                  <SplitInput
                    id="split-train"
                    label="Train"
                    value={split.train}
                    onChange={(train) => {
                      setSplit({ ...split, train });
                    }}
                  />
                  <SplitInput
                    id="split-val"
                    label="Validation"
                    value={split.val}
                    onChange={(val) => {
                      setSplit({ ...split, val });
                    }}
                  />
                  <SplitInput
                    id="split-test"
                    label="Test"
                    value={split.test}
                    onChange={(test) => {
                      setSplit({ ...split, test });
                    }}
                  />
                </div>
                <p
                  className={cn("text-[12px]", total === 100 ? "text-muted-foreground" : "text-destructive")}
                >
                  {total === 100
                    ? "Whole pages go to one split, so words from a page never leak between train and test."
                    : `Adds up to ${String(total)}%; it must be 100%.`}
                </p>
              </div>
              {format === "doctr-recognition" && (
                <div className="grid max-w-[200px] gap-1.5">
                  <Label htmlFor="crop-padding">Padding around word crops</Label>
                  <div className="relative">
                    <Input
                      id="crop-padding"
                      type="number"
                      min={0}
                      max={32}
                      value={padding}
                      className="h-9 pr-8 tabular-nums"
                      onChange={(e) => {
                        setPadding(Math.max(0, Math.min(32, Number(e.target.value) || 0)));
                      }}
                    />
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px]">
                      px
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label id="export-format-label">Format</Label>
              <RadioGroup
                value={format}
                onValueChange={setFormat}
                aria-labelledby="export-format-label"
                className="gap-2"
              >
                {formats.map((f) => (
                  <label
                    key={f.id}
                    htmlFor={`format-${f.id}`}
                    className={cn(
                      "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-3",
                      format === f.id && "border-brand bg-accent hover:bg-accent",
                    )}
                  >
                    <RadioGroupItem id={`format-${f.id}`} value={f.id} className="mt-0.5" />
                    <span>
                      <span className="block text-[13px] font-medium">{f.title}</span>
                      <span className="text-muted-foreground block text-[12px]">{f.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <div className="bg-muted/40 flex flex-wrap items-center gap-3 border-t px-6 py-3.5">
            <div className="min-w-0 flex-1">
              <FormError message={error} />
              {!error && (
                <p className="text-muted-foreground hidden truncate text-[12px] sm:block">
                  {pageCount} {pageCount === 1 ? "page" : "pages"} ·{" "}
                  {formats.find((f) => f.id === format)?.title ?? format} · split {split.train}/{split.val}/
                  {split.test}
                </p>
              )}
            </div>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || total !== 100 || !name.trim()}>
              {pending ? "Starting…" : "Start export"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
