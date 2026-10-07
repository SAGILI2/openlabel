import type { Exporter } from "../types.js";
import { bump, emptyStats, safeFileName, textRegions, utf8 } from "../util.js";

/**
 * Generic JSONL: one line per page per split (`train.jsonl`), with the image path, size, full text
 * in reading order and every word with its polygon. Images are included under `images/`.
 */
export const jsonlPages: Exporter = {
  id: "jsonl",
  title: "JSONL (one page per line)",
  description: "Page text, words and boxes as JSON Lines, with images. Easy to load anywhere.",
  taskTypes: ["document.ocr"],
  async run(snapshot, load, sink, options) {
    const stats = emptyStats();
    const lines: Record<string, string[]> = {};
    for (const item of snapshot.items) {
      const name = safeFileName(item);
      await sink.add(`images/${name}`, await load(item.assetId));
      const words = textRegions(item, options).map((r) => ({ id: r.id, text: r.text, poly: r.poly }));
      (lines[item.split] ??= []).push(
        JSON.stringify({
          image: `images/${name}`,
          asset_id: item.assetId,
          annotation_version: item.annotationVersion,
          width: item.width,
          height: item.height,
          text: words.map((w) => w.text).join(" "),
          words,
        }),
      );
      bump(stats, item.split, "assets");
      bump(stats, item.split, "words", words.length);
      bump(stats, item.split, "files");
    }
    for (const [split, rows] of Object.entries(lines)) {
      await sink.add(`${split}.jsonl`, utf8(`${rows.join("\n")}\n`));
    }
    return stats;
  },
};
