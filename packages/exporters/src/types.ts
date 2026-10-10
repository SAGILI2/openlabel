import type { ImageAnnotation, Split } from "@openlabel/contracts";

/** One labelled page in a frozen dataset. */
export interface SnapshotItem {
  assetId: string;
  /** Original file name, used to name exported files (sanitised by the exporter). */
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  split: Split;
  annotationVersion: number;
  /** Regions (OCR and other region tasks); empty for whole-file tasks. */
  annotation: ImageAnnotation;
  /** Class keys for whole-file tasks (classification); empty otherwise. */
  labels: string[];
}

export interface Snapshot {
  exportId: string;
  projectName: string;
  taskType: string;
  createdAt: string;
  /** The project's classes in order (classification), for class indices and display names. */
  classes: { key: string; name: string }[];
  items: SnapshotItem[];
}

/** Reads an asset's original bytes (from object storage in production, memory in tests). */
export type LoadImage = (assetId: string) => Promise<Uint8Array>;

/** Receives the exported files one by one, e.g. a streaming ZIP writer. */
export interface FileSink {
  add(path: string, data: Uint8Array): Promise<void>;
}

export interface ExportOptions {
  /** Pixels added around each word crop (docTR recognition). */
  cropPadding: number;
  /** Skip regions marked ignore ("don't care"). Always true for training formats. */
  skipIgnored: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = { cropPadding: 2, skipIgnored: true };

/** Per-split counts reported by an exporter. */
export type ExportStats = Record<string, { assets: number; words: number; files: number }>;

export interface Exporter {
  /** Stable id, e.g. `doctr-recognition`; matches task types' `exportFormats`. */
  id: string;
  title: string;
  description: string;
  /** Task types this exporter accepts. */
  taskTypes: readonly string[];
  run(snapshot: Snapshot, load: LoadImage, sink: FileSink, options: ExportOptions): Promise<ExportStats>;
}
