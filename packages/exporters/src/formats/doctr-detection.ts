import type { Exporter } from "../types.js";
import { bump, emptyStats, json, safeFileName, textRegions } from "../util.js";

/**
 * docTR detection training set: full pages plus `labels.json` per split with each page's size and
 * word polygons in absolute pixels (`{ img_dimensions, img_hash, polygons }`).
 */
export const doctrDetection: Exporter = {
  id: "doctr-detection",
  title: "docTR detection (pages + word polygons)",
  description: "Full page images with word polygons, for training text detectors.",
  taskTypes: ["document.ocr"],
  async run(snapshot, load, sink, options) {
    const stats = emptyStats();
    const labels: Record<string, Record<string, unknown>> = {};
    for (const item of snapshot.items) {
      const name = safeFileName(item);
      await sink.add(`${item.split}/images/${name}`, await load(item.assetId));
      const polygons = textRegions(item, options).map((r) => r.poly);
      (labels[item.split] ??= {})[name] = {
        img_dimensions: [item.width, item.height],
        img_hash: item.assetId,
        polygons,
      };
      bump(stats, item.split, "assets");
      bump(stats, item.split, "files");
      bump(stats, item.split, "words", polygons.length);
    }
    for (const [split, map] of Object.entries(labels)) {
      await sink.add(`${split}/labels.json`, json(map));
    }
    return stats;
  },
};
