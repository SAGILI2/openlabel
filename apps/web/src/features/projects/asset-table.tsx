import Link from "next/link";
import { LocalTime } from "@/components/time";
import { cn } from "@/lib/utils";

export interface AssetView {
  id: string;
  originalName: string;
  status: "new" | "prelabelling" | "prelabelled" | "in_progress" | "submitted" | "approved" | "rejected";
  width: number | null;
  height: number | null;
  createdAt: string;
}

const STATUS: Record<AssetView["status"], { label: string; tone: string }> = {
  new: { label: "Waiting for OCR", tone: "bg-muted text-muted-foreground" },
  prelabelling: { label: "Reading…", tone: "bg-accent text-accent-foreground" },
  prelabelled: { label: "Ready to label", tone: "bg-[#E8A400]/15 text-[#8a6100] dark:text-[#E8A400]" },
  in_progress: { label: "In progress", tone: "bg-accent text-accent-foreground" },
  submitted: { label: "Labelled", tone: "bg-success/15 text-success" },
  approved: { label: "Approved", tone: "bg-success/15 text-success" },
  rejected: { label: "Rejected", tone: "bg-destructive/10 text-destructive" },
};

/** Project assets with status; each row opens the editor. */
export function AssetTable({ projectSlug, assets }: { projectSlug: string; assets: AssetView[] }) {
  if (assets.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-[13px]">
        No images yet. Upload pages above to start.
      </p>
    );
  }
  return (
    <div className="bg-card overflow-hidden rounded-lg border" role="table">
      <div
        role="row"
        className="text-muted-foreground bg-muted/50 hidden h-10 grid-cols-[minmax(0,1fr)_120px_160px_160px] items-center gap-4 border-b px-4 text-[12px] font-medium md:grid"
      >
        <span role="columnheader">File</span>
        <span role="columnheader">Size</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Added</span>
      </div>
      {assets.map((a) => (
        <Link
          key={a.id}
          role="row"
          href={`/projects/${projectSlug}/label/${a.id}`}
          className="hover:bg-muted/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_160px_160px]"
        >
          <span role="cell" className="truncate font-mono text-[13px]">
            {a.originalName}
          </span>
          <span role="cell" className="text-muted-foreground hidden text-[13px] tabular-nums md:block">
            {a.width && a.height ? `${String(a.width)} × ${String(a.height)}` : "—"}
          </span>
          <span role="cell">
            <span className={cn("rounded px-2 py-0.5 text-[12px] font-medium", STATUS[a.status].tone)}>
              {STATUS[a.status].label}
            </span>
          </span>
          <span role="cell" className="text-muted-foreground hidden text-[13px] md:block">
            <LocalTime iso={a.createdAt} format="date" />
          </span>
        </Link>
      ))}
    </div>
  );
}
