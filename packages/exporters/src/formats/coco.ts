import type { Exporter } from "../types.js";
import { bounds, bump, emptyStats, json, safeFileName, textRegions } from "../util.js";

/**
 * COCO detection: one `annotations/<split>.json` per split with images, a single `word` category,
 * boxes as `[x, y, width, height]`, polygons as segmentation, and the text in `attributes`.
 */
export const coco: Exporter = {
  id: "coco",
  title: "COCO (word boxes)",
  description: "Standard detection format with word boxes and their text.",
  taskTypes: ["document.ocr"],
  async run(snapshot, load, sink, options) {
    const stats = emptyStats();
    const perSplit: Record<
      string,
      { images: unknown[]; annotations: unknown[]; nextImage: number; nextAnn: number }
    > = {};
    for (const item of snapshot.items) {
      const s = (perSplit[item.split] ??= { images: [], annotations: [], nextImage: 1, nextAnn: 1 });
      const name = safeFileName(item);
      await sink.add(`images/${item.split}/${name}`, await load(item.assetId));
      const imageId = s.nextImage++;
      s.images.push({ id: imageId, file_name: name, width: item.width, height: item.height });
      for (const r of textRegions(item, options)) {
        const b = bounds(r.poly, item.width, item.height);
        s.annotations.push({
          id: s.nextAnn++,
          image_id: imageId,
          category_id: 1,
          bbox: [b.x, b.y, b.w, b.h],
          area: b.w * b.h,
          segmentation: [r.poly.flat()],
          iscrowd: 0,
          attributes: { text: r.text },
        });
        bump(stats, item.split, "words");
      }
      bump(stats, item.split, "assets");
      bump(stats, item.split, "files");
    }
    for (const [split, s] of Object.entries(perSplit)) {
      await sink.add(
        `annotations/${split}.json`,
        json({
          info: {
            description: snapshot.projectName,
            date_created: snapshot.createdAt,
            version: snapshot.exportId,
          },
          categories: [{ id: 1, name: "word", supercategory: "text" }],
          images: s.images,
          annotations: s.annotations,
        }),
      );
    }
    return stats;
  },
};
