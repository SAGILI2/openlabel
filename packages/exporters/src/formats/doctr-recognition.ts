import sharp from "sharp";
import type { Exporter } from "../types.js";
import { bounds, bump, emptyStats, json, textRegions } from "../util.js";

/**
 * docTR recognition training set: one PNG crop per word and a `labels.json` mapping file name to
 * text, per split (`train/images/*.png`, `train/labels.json`). Crops are cut from the original
 * image in its own pixel coordinates; nothing is re-detected.
 */
export const doctrRecognition: Exporter = {
  id: "doctr-recognition",
  title: "docTR recognition (word crops)",
  description: "One image per word plus labels.json per split, for training text recognisers.",
  taskTypes: ["document.ocr"],
  async run(snapshot, load, sink, options) {
    const stats = emptyStats();
    const labels: Record<string, Record<string, string>> = {};
    let counter = 0;
    for (const item of snapshot.items) {
      const words = textRegions(item, options).filter((r) => r.text.trim() !== "");
      bump(stats, item.split, "assets");
      if (words.length === 0) continue;
      const source = sharp(await load(item.assetId)).rotate();
      const meta = await source.metadata();
      const width = meta.autoOrient.width;
      const height = meta.autoOrient.height;
      for (const word of words) {
        const box = bounds(word.poly, width, height, options.cropPadding);
        if (box.w < 2 || box.h < 2) continue;
        const name = `${String(counter++).padStart(7, "0")}.png`;
        const png = await source
          .clone()
          .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
          .png()
          .toBuffer();
        await sink.add(`${item.split}/images/${name}`, png);
        (labels[item.split] ??= {})[name] = word.text;
        bump(stats, item.split, "words");
        bump(stats, item.split, "files");
      }
    }
    for (const [split, map] of Object.entries(labels)) {
      await sink.add(`${split}/labels.json`, json(map));
    }
    return stats;
  },
};
