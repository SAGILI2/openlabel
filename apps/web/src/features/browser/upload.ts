"use client";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/tiff", "image/bmp"];

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
  return out;
}

/** Files from an <input type=file>, with folder paths when the folder picker was used. */
export function itemsFromInput(files: FileList | null): UploadItem[] {
  return Array.from(files ?? []).map((file) => ({ file, relativePath: file.webkitRelativePath || "" }));
}

/** Uploads images a few at a time into a project (and optional folder), reporting progress. */
export async function uploadAll(
  projectId: string,
  folderId: string | null,
  items: UploadItem[],
  onProgress: (p: UploadProgress) => void,
  parallel = 3,
): Promise<UploadProgress> {
  const images = items.filter((i) => ACCEPTED_TYPES.includes(i.file.type));
  const skipped = items.length - images.length;
  const state: UploadProgress = {
    total: images.length,
    done: 0,
    failed: skipped > 0 ? [{ name: `${String(skipped)} file(s)`, reason: "not a supported image type" }] : [],
  };
  onProgress({ ...state });
  const queue = [...images];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const form = new FormData();
        form.append("file", item.file);
        if (folderId) form.append("folderId", folderId);
        if (item.relativePath) form.append("relativePath", item.relativePath);
        let reason: string | null = null;
        try {
          const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { detail?: string } | null;
            reason = body?.detail ?? `Upload failed (${String(res.status)})`;
          }
        } catch {
          reason = "Network error";
        }
        state.done += 1;
        if (reason) state.failed.push({ name: item.relativePath || item.file.name, reason });
        onProgress({ ...state, failed: [...state.failed] });
      }
    }),
  );
  return state;
}
