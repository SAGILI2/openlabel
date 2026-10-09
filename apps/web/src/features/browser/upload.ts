"use client";

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/bmp",
  "application/pdf",
];

export interface UploadItem {
  file: File;
  /** Path inside a dropped/picked folder, e.g. `july/CA/page1.jpg`; empty for loose files. */
  relativePath: string;
}

export interface UploadProgress {
  total: number;
  done: number;
  failed: { name: string; reason: string }[];
}

/** Reads every file from a drag-and-drop, walking into dropped folders and keeping their paths. */
export async function itemsFromDrop(dataTransfer: DataTransfer): Promise<UploadItem[]> {
  const entries = Array.from(dataTransfer.items)
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: "" }));
  }
  const out: UploadItem[] = [];
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : "" });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // readEntries returns results in batches; keep reading until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, dirPath);
    }
  }
  for (const entry of entries) await walk(entry, "");
  return insideOneFolder(out);
}

/** Files from an <input type=file>, with folder paths when the folder picker was used. */
export function itemsFromInput(files: FileList | null): UploadItem[] {
  return insideOneFolder(
    Array.from(files ?? []).map((file) => ({ file, relativePath: file.webkitRelativePath || "" })),
  );
}

/**
 * Picking or dropping one folder uploads what's inside it: `dataset/Axis Bank/a.jpg` lands in
 * `Axis Bank/`, not in a new `dataset/` wrapper. Several folders dropped together keep their names.
 */
export function insideOneFolder(items: UploadItem[]): UploadItem[] {
  const tops = new Set(items.map((i) => (i.relativePath.includes("/") ? i.relativePath.split("/")[0] : "")));
  if (tops.size !== 1 || tops.has("")) return items;
  return items.map((i) => ({ ...i, relativePath: i.relativePath.split("/").slice(1).join("/") }));
}

/**
 * Uploads images a few at a time into a project (and optional folder). Built for very large
 * folders: an index walks the list instead of shifting it, progress reaches React at most a few
 * times a second, failures keep only the first 50 names, and `signal` stops it cleanly.
 */
export async function uploadAll(
  projectId: string,
  folderId: string | null,
  items: UploadItem[],
  onProgress: (p: UploadProgress) => void,
  opts: { parallel?: number; signal?: AbortSignal } = {},
): Promise<UploadProgress> {
  const parallel = opts.parallel ?? 6;
  const images = items.filter((i) => ACCEPTED_TYPES.includes(i.file.type));
  const skipped = items.length - images.length;
  const state: UploadProgress = {
    total: images.length,
    done: 0,
    failed: skipped > 0 ? [{ name: `${String(skipped)} file(s)`, reason: "not an image or PDF" }] : [],
  };
  let failedCount = state.failed.length;
  let lastReport = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    onProgress({ ...state, failed: [...state.failed] });
  };
  report(true);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(parallel, images.length) }, async () => {
      while (next < images.length && !opts.signal?.aborted) {
        const item = images[next++];
        if (!item) break;
        const form = new FormData();
        form.append("file", item.file);
        if (folderId) form.append("folderId", folderId);
        if (item.relativePath) form.append("relativePath", item.relativePath);
        let reason: string | null = null;
        try {
          const res = await fetch(`/api/projects/${projectId}/assets`, {
            method: "POST",
            body: form,
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { detail?: string } | null;
            reason = body?.detail ?? `Upload failed (${String(res.status)})`;
          }
        } catch {
          reason = opts.signal?.aborted ? null : "Network error";
        }
        if (opts.signal?.aborted) break;
        state.done += 1;
        if (reason) {
          failedCount += 1;
          if (state.failed.length < 50)
            state.failed.push({ name: item.relativePath || item.file.name, reason });
        }
        report();
      }
    }),
  );
  if (failedCount > state.failed.length) {
    state.failed.push({ name: `${String(failedCount - state.failed.length)} more`, reason: "also failed" });
  }
  report(true);
  return state;
}
