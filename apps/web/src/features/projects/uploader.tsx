"use client";
import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

const ACCEPT = "image/png,image/jpeg,image/webp,image/tiff,image/bmp";
const PARALLEL = 3;

interface Progress {
  total: number;
  done: number;
  failed: { name: string; reason: string }[];
}

/** Drag-and-drop (or pick) many images; uploads a few at a time and refreshes the list. */
export function Uploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function uploadOne(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    return body?.detail ?? `Upload failed (${String(res.status)})`;
  }

  async function upload(files: File[]) {
    const images = files.filter((f) => ACCEPT.split(",").includes(f.type));
    if (images.length === 0) return;
    const state: Progress = { total: images.length, done: 0, failed: [] };
    setProgress({ ...state });
    const queue = [...images];
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const reason = await uploadOne(file).catch(() => "Network error");
          state.done += 1;
          if (reason) state.failed.push({ name: file.name, reason });
          setProgress({ ...state, failed: [...state.failed] });
        }
      }),
    );
    router.refresh();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    void upload(Array.from(e.dataTransfer.files));
  }

  const busy = progress !== null && progress.done < progress.total;

  return (
    <div className="grid gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={onDrop}
        className={cn(
          "bg-card hover:border-brand/60 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
          over && "border-brand bg-accent",
        )}
      >
        <UploadCloud className="text-muted-foreground size-6" strokeWidth={1.5} aria-hidden />
        <p className="font-medium">{busy ? "Uploading…" : "Drop page images here, or click to choose"}</p>
        <p className="text-muted-foreground text-[12px]">
          PNG, JPEG, WebP, TIFF or BMP, up to 25 MB each. OCR drafts the words in the background.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {progress && (
        <div className="text-[12px]" role="status">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-brand h-full transition-[width]"
              style={{ width: `${String((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-1">
            {progress.done} of {progress.total} uploaded
            {progress.failed.length > 0 && ` · ${String(progress.failed.length)} failed`}
          </p>
          {progress.failed.map((f) => (
            <p key={f.name} className="text-destructive">
              {f.name}: {f.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
