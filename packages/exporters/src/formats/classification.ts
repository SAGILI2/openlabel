import type { Exporter, Snapshot, SnapshotItem } from "../types.js";
import { bump, emptyStats, safeFileName, utf8 } from "../util.js";

const TASKS = ["document.classification", "image.classification"] as const;

/** Class names by key, falling back to the key for classes removed after labelling. */
function names(snapshot: Snapshot): Map<string, string> {
  return new Map(snapshot.classes.map((c) => [c.key, c.name]));
}

/** CSV field: quoted when it has a comma, quote or newline. */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Folder-safe class directory name (ImageFolder); keys are already slug-like. */
function dir(key: string): string {
  return key.replace(/[^\w.-]+/g, "_") || "unlabelled";
}

async function addImage(
  item: SnapshotItem,
  load: (id: string) => Promise<Uint8Array>,
  sink: { add: (p: string, d: Uint8Array) => Promise<void> },
) {
  const name = safeFileName(item);
  await sink.add(`images/${name}`, await load(item.assetId));
  return `images/${name}`;
}

/**
 * CSV: `<split>.csv` with `image,label` (single-label) or `image,labels` joined by `|`
 * (multi-label), plus `classes.csv` with each class's index, key and name. Images under `images/`.
 */
export const classificationCsv: Exporter = {
  id: "classification-csv",
  title: "CSV (image, label)",
  description: "One CSV per split with the image path and its class, plus classes.csv. Opens in any tool.",
  taskTypes: TASKS,
  async run(snapshot, load, sink) {
    const stats = emptyStats();
    const rows: Record<string, string[]> = {};
    const multi = snapshot.items.some((i) => i.labels.length > 1);
    for (const item of snapshot.items) {
      const path = await addImage(item, load, sink);
      (rows[item.split] ??= []).push(`${cell(path)},${cell(item.labels.join("|"))}`);
      bump(stats, item.split, "assets");
      bump(stats, item.split, "words", item.labels.length);
      bump(stats, item.split, "files");
    }
    const header = multi ? "image,labels" : "image,label";
    for (const [split, lines] of Object.entries(rows)) {
      await sink.add(`${split}.csv`, utf8(`${header}\n${lines.join("\n")}\n`));
    }
    const n = names(snapshot);
    await sink.add(
      "classes.csv",
      utf8(
        `index,key,name\n${snapshot.classes.map((c, i) => `${String(i)},${cell(c.key)},${cell(n.get(c.key) ?? c.key)}`).join("\n")}\n`,
      ),
    );
    return stats;
  },
};

/** JSONL: one line per file per split with the image path, class keys and class names. */
export const classificationJsonl: Exporter = {
  id: "classification-jsonl",
  title: "JSONL (one file per line)",
  description: "Image path with its class keys and names, one JSON object per line. Easy to load anywhere.",
  taskTypes: TASKS,
  async run(snapshot, load, sink) {
    const stats = emptyStats();
    const lines: Record<string, string[]> = {};
    const n = names(snapshot);
    const index = new Map(snapshot.classes.map((c, i) => [c.key, i]));
    for (const item of snapshot.items) {
      const path = await addImage(item, load, sink);
      (lines[item.split] ??= []).push(
        JSON.stringify({
          image: path,
          asset_id: item.assetId,
          annotation_version: item.annotationVersion,
          labels: item.labels,
          label_names: item.labels.map((k) => n.get(k) ?? k),
          label_ids: item.labels.map((k) => index.get(k) ?? -1),
        }),
      );
      bump(stats, item.split, "assets");
      bump(stats, item.split, "words", item.labels.length);
      bump(stats, item.split, "files");
    }
    for (const [split, rows] of Object.entries(lines)) {
      await sink.add(`${split}.jsonl`, utf8(`${rows.join("\n")}\n`));
    }
    await sink.add("classes.json", utf8(`${JSON.stringify(snapshot.classes, null, 2)}\n`));
    return stats;
  },
};

/**
 * ImageFolder (torchvision / Keras / Hugging Face `imagefolder`): `<split>/<class>/<file>`.
 * Single-label only: a file with several classes is copied into each class folder.
 */
export const imageFolder: Exporter = {
  id: "imagefolder",
  title: "ImageFolder (split/class/file)",
  description: "A folder per split and class, read directly by PyTorch, Keras and Hugging Face.",
  taskTypes: TASKS,
  async run(snapshot, load, sink) {
    const stats = emptyStats();
    for (const item of snapshot.items) {
      const bytes = await load(item.assetId);
      const name = safeFileName(item);
      for (const key of item.labels) {
        await sink.add(`${item.split}/${dir(key)}/${name}`, bytes);
        bump(stats, item.split, "files");
      }
      bump(stats, item.split, "assets");
      bump(stats, item.split, "words", item.labels.length);
    }
    return stats;
  },
};
