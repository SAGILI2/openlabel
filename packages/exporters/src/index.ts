/** @openlabel/exporters — turn a frozen dataset into training formats. */
import { coco } from "./formats/coco.js";
import { doctrDetection } from "./formats/doctr-detection.js";
import { doctrRecognition } from "./formats/doctr-recognition.js";
import { jsonlPages } from "./formats/jsonl.js";
import type { Exporter } from "./types.js";

export * from "./types.js";
export { createZipSink } from "./zip.js";
export { coco, doctrDetection, doctrRecognition, jsonlPages };

/** Exporters shipped with OpenLabel, by id. */
export const EXPORTERS: ReadonlyMap<string, Exporter> = new Map(
  [doctrRecognition, doctrDetection, jsonlPages, coco].map((e) => [e.id, e]),
);

/** Exporters that accept a task type, in display order. */
export function exportersFor(taskType: string): Exporter[] {
  return [...EXPORTERS.values()].filter((e) => e.taskTypes.includes(taskType));
}
