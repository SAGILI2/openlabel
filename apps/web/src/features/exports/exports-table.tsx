import { Download } from "lucide-react";
import { LocalTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ExportView {
  id: string;
  name: string;
  formatTitle: string;
  status: "queued" | "running" | "ready" | "failed";
  itemCount: number;
  stats: Record<string, { assets?: number; words?: number } | undefined>;
  byteSize: number | null;
  error: string | null;
  createdAt: string;
}

const STATUS: Record<ExportView["status"], { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "bg-muted text-muted-foreground" },
  running: { label: "Building…", tone: "bg-accent text-accent-foreground" },
  ready: { label: "Ready", tone: "bg-success/15 text-success" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
};

function size(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function splitSummary(stats: ExportView["stats"]): string {
  return (["train", "val", "test"] as const)
    .map((s) => {
      const st = stats[s];
      return st?.assets ? `${s} ${String(st.assets)}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

function words(stats: ExportView["stats"]): number {
  return Object.values(stats).reduce((n, s) => n + (s?.words ?? 0), 0);
}

export function ExportsTable({ exports }: { exports: ExportView[] }) {
  if (exports.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-[13px]">
        No exports yet. When pages are labelled, create one to download training data.
      </p>
    );
  }
  return (
    <div className="bg-card overflow-hidden rounded-lg border" role="table">
      <div
        role="row"
        className="text-muted-foreground bg-muted/50 hidden h-10 grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_110px_120px] items-center gap-4 border-b px-4 text-[12px] font-medium lg:grid"
      >
        <span role="columnheader">Name</span>
        <span role="columnheader">Format</span>
        <span role="columnheader">Contents</span>
        <span role="columnheader">Size</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="sr-only">
          Download
        </span>
      </div>
      {exports.map((e) => (
        <div
          key={e.id}
          role="row"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_110px_120px]"
        >
          <div role="cell" className="min-w-0">
            <p className="truncate font-medium">{e.name}</p>
            <p className="text-muted-foreground text-[12px]">
              <LocalTime iso={e.createdAt} />
            </p>
          </div>
          <span role="cell" className="text-muted-foreground hidden truncate text-[13px] lg:block">
            {e.formatTitle}
          </span>
          <span
            role="cell"
            className="text-muted-foreground col-span-2 text-[13px] tabular-nums lg:col-span-1"
          >
            {e.status === "ready"
              ? `${String(e.itemCount)} pages, ${String(words(e.stats))} words · ${splitSummary(e.stats)}`
              : e.status === "failed"
                ? (e.error ?? "Failed")
                : `${String(e.itemCount)} pages`}
          </span>
          <span role="cell" className="text-muted-foreground hidden text-[13px] tabular-nums lg:block">
            {size(e.byteSize)}
          </span>
          <span role="cell">
            <span className={cn("rounded px-2 py-0.5 text-[12px] font-medium", STATUS[e.status].tone)}>
              {STATUS[e.status].label}
            </span>
          </span>
          <div role="cell" className="justify-self-end">
            {e.status === "ready" && (
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/exports/${e.id}/download`} download>
                  <Download aria-hidden />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
