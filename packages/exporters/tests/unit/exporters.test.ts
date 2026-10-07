import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { ImageAnnotation } from "@openlabel/contracts";
import {
  createZipSink,
  DEFAULT_OPTIONS,
  EXPORTERS,
  exportersFor,
  type LoadImage,
  type Snapshot,
  type SnapshotItem,
} from "../../src/index.js";

const W = 200;
const H = 100;
let page: Uint8Array;

/** A white page with two solid colour patches where the "words" are, so crops are checkable. */
beforeAll(async () => {
  page = new Uint8Array(
    await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite([
        {
          input: await sharp({ create: { width: 40, height: 20, channels: 3, background: "#ff0000" } })
            .png()
            .toBuffer(),
          left: 10,
          top: 10,
        },
        {
          input: await sharp({ create: { width: 30, height: 20, channels: 3, background: "#0000ff" } })
            .png()
            .toBuffer(),
          left: 100,
          top: 50,
        },
      ])
      .png()
      .toBuffer(),
  );
});

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function annotation(): ImageAnnotation {
  return {
    tags: [],
    regions: [
      {
        id: "w1",
        kind: "text",
        label: "word",
        poly: rect(10, 10, 40, 20),
        text: "Total",
        layer: "document",
        relations: [],
        attributes: {},
        ignore: false,
        flags: [],
      },
      {
        id: "w2",
        kind: "text",
        label: "word",
        poly: rect(100, 50, 30, 20),
        text: "1O5",
        layer: "document",
        relations: [],
        attributes: {},
        ignore: false,
        flags: [],
      },
      {
        id: "w3",
        kind: "text",
        label: "word",
        poly: rect(150, 10, 20, 10),
        text: "skip",
        layer: "document",
        relations: [],
        attributes: {},
        ignore: true,
        flags: [],
      },
      {
        id: "l1",
        kind: "non-text",
        label: "logo",
        poly: rect(0, 0, 5, 5),
        layer: "overlay",
        relations: [],
        attributes: {},
        ignore: false,
      },
    ],
  };
}

function item(assetId: string, split: SnapshotItem["split"]): SnapshotItem {
  return {
    assetId,
    fileName: "Invoice 0187.png",
    mimeType: "image/png",
    width: W,
    height: H,
    split,
    annotationVersion: 3,
    annotation: annotation(),
  };
}

const snapshot = (): Snapshot => ({
  exportId: "exp-1",
  projectName: "Invoices",
  taskType: "document.ocr",
  createdAt: "2026-10-07T00:00:00.000Z",
  items: [item("aaaaaaaa-1", "train"), item("bbbbbbbb-2", "val")],
});

const load: LoadImage = () => Promise.resolve(page);

async function runToZip(id: string) {
  const exporter = EXPORTERS.get(id);
  if (!exporter) throw new Error(`no exporter ${id}`);
  const chunks: Uint8Array[] = [];
  const { sink, finish } = createZipSink((c) => chunks.push(c));
  const stats = await exporter.run(snapshot(), load, sink, { ...DEFAULT_OPTIONS, cropPadding: 0 });
  await finish();
  const zipBytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    zipBytes.set(c, offset);
    offset += c.length;
  }
  return { files: unzipSync(zipBytes), stats };
}

describe("exporter contract", () => {
  for (const exporter of EXPORTERS.values()) {
    it(`${exporter.id}: produces a valid ZIP and reports every split`, async () => {
      const { files, stats } = await runToZip(exporter.id);
      expect(Object.keys(files).length).toBeGreaterThan(0);
      expect(Object.keys(stats).sort()).toEqual(["train", "val"]);
      expect(stats.train?.assets).toBe(1);
    });
  }

  it("lists exporters per task type", () => {
    expect(exportersFor("document.ocr").map((e) => e.id)).toEqual([
      "doctr-recognition",
      "doctr-detection",
      "jsonl",
      "coco",
    ]);
    expect(exportersFor("audio.transcription")).toEqual([]);
  });
});

describe("doctr-recognition", () => {
  it("cuts one crop per word from original pixels, skipping ignored and non-text regions", async () => {
    const { files, stats } = await runToZip("doctr-recognition");
    const labels = JSON.parse(strFromU8(files["train/labels.json"] ?? new Uint8Array())) as Record<
      string,
      string
    >;
    expect(Object.values(labels)).toEqual(["Total", "1O5"]);
    expect(stats.train?.words).toBe(2);

    const [first, second] = Object.keys(labels);
    const a = await sharp(files[`train/images/${first ?? ""}`])
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([a.info.width, a.info.height]).toEqual([40, 20]);
    expect([...a.data.subarray(0, 3)]).toEqual([255, 0, 0]);
    const b = await sharp(files[`train/images/${second ?? ""}`])
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([b.info.width, b.info.height]).toEqual([30, 20]);
    expect([...b.data.subarray(0, 3)]).toEqual([0, 0, 255]);
  });
});

describe("doctr-detection", () => {
  it("writes pages and absolute polygons per split", async () => {
    const { files } = await runToZip("doctr-detection");
    const labels = JSON.parse(strFromU8(files["val/labels.json"] ?? new Uint8Array())) as Record<
      string,
      { img_dimensions: number[]; polygons: number[][][] }
    >;
    const [name, entry] = Object.entries(labels)[0] ?? [];
    expect(name).toBe("bbbbbbbb_Invoice_0187.png");
    expect(entry?.img_dimensions).toEqual([W, H]);
    expect(entry?.polygons).toHaveLength(2);
    expect(files[`val/images/${name ?? ""}`]).toBeDefined();
  });
});

describe("jsonl", () => {
  it("writes one line per page with text in reading order", async () => {
    const { files } = await runToZip("jsonl");
    const rows = strFromU8(files["train.jsonl"] ?? new Uint8Array())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { text: string; annotation_version: number });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("Total 1O5");
    expect(rows[0]?.annotation_version).toBe(3);
  });
});

describe("coco", () => {
  it("writes [x, y, w, h] boxes with the text attached", async () => {
    const { files } = await runToZip("coco");
    const doc = JSON.parse(strFromU8(files["annotations/train.json"] ?? new Uint8Array())) as {
      images: unknown[];
      annotations: { bbox: number[]; attributes: { text: string } }[];
    };
    expect(doc.images).toHaveLength(1);
    expect(doc.annotations.map((a) => [a.bbox, a.attributes.text])).toEqual([
      [[10, 10, 40, 20], "Total"],
      [[100, 50, 30, 20], "1O5"],
    ]);
  });
});
