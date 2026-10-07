import type { TextRegion } from "@openlabel/contracts";
import type { ExportOptions, ExportStats, SnapshotItem } from "./types.js";

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function json(value: unknown): Uint8Array {
  return utf8(`${JSON.stringify(value, null, 2)}\n`);
}

/** File-system safe, keeps the extension; prefixes a short asset id to stay unique. */
export function safeFileName(item: Pick<SnapshotItem, "assetId" | "fileName">): string {
  const cleaned = item.fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-80);
  return `${item.assetId.slice(0, 8)}_${cleaned || "page"}`;
}

/** Text regions to export, in stored (reading) order. */
export function textRegions(item: SnapshotItem, options: ExportOptions): TextRegion[] {
  return item.annotation.regions.filter(
    (r): r is TextRegion => r.kind === "text" && (!options.skipIgnored || !r.ignore),
  );
}

/** Axis-aligned bounds of a polygon, clamped to the image. */
export function bounds(
  poly: readonly (readonly [number, number])[],
  width: number,
  height: number,
  pad = 0,
): { x: number; y: number; w: number; h: number } {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x1 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const y1 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const x2 = Math.min(width, Math.ceil(Math.max(...xs) + pad));
  const y2 = Math.min(height, Math.ceil(Math.max(...ys) + pad));
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

export function emptyStats(): ExportStats {
  return {};
}

export function bump(stats: ExportStats, split: string, field: "assets" | "words" | "files", by = 1): void {
  const s = (stats[split] ??= { assets: 0, words: 0, files: 0 });
  s[field] += by;
}
