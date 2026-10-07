import {
  canonicalOcrPageSchema,
  imageAnnotationSchema,
  type ImageAnnotation,
  type TextRegion,
} from "@openlabel/contracts";

/** Axis-aligned box in image pixels; what the MVP editor draws and resizes. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A word box being edited. Mirrors a text region, flattened for the canvas. */
export interface EditableWord {
  id: string;
  text: string;
  box: Box;
  /** Model confidence when it came from a prediction and hasn't been edited; null otherwise. */
  conf: number | null;
  lineId?: string | undefined;
}

/** Below this, a word is highlighted for review. */
export const LOW_CONFIDENCE = 0.8;

export function polyToBox(poly: readonly (readonly [number, number])[]): Box {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function boxToPoly(b: Box): [number, number][] {
  const r = (n: number) => Math.round(n * 10) / 10;
  return [
    [r(b.x), r(b.y)],
    [r(b.x + b.width), r(b.y)],
    [r(b.x + b.width), r(b.y + b.height)],
    [r(b.x), r(b.y + b.height)],
  ];
}

/** Words from a canonical OCR prediction, in reading order (line by line). */
export function wordsFromPrediction(result: unknown): EditableWord[] {
  const parsed = canonicalOcrPageSchema.safeParse(result);
  if (!parsed.success) return [];
  return parsed.data.lines.flatMap((line) =>
    line.words.map((w) => ({
      id: w.id,
      text: w.text,
      box: polyToBox(w.poly),
      conf: w.conf,
      lineId: line.id,
    })),
  );
}

/** Words from a saved annotation (text regions only). */
export function wordsFromAnnotation(data: unknown): EditableWord[] {
  const parsed = imageAnnotationSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.regions
    .filter((r): r is TextRegion => r.kind === "text")
    .map((r) => ({ id: r.id, text: r.text, box: polyToBox(r.poly), conf: r.conf ?? null, lineId: r.lineId }));
}

/** The annotation to save. Degenerate boxes (under 2px either way) are dropped. */
export function annotationFromWords(words: readonly EditableWord[]): ImageAnnotation {
  return imageAnnotationSchema.parse({
    tags: [],
    regions: words
      .filter((w) => w.box.width >= 2 && w.box.height >= 2)
      .map((w) => ({
        id: w.id,
        kind: "text",
        label: "word",
        poly: boxToPoly(w.box),
        text: w.text,
        ...(w.lineId ? { lineId: w.lineId } : {}),
        ...(w.conf === null ? {} : { conf: w.conf }),
      })),
  });
}

/** Normalises a box drawn in any direction (negative width/height). */
export function normaliseBox(b: Box): Box {
  return {
    x: b.width < 0 ? b.x + b.width : b.x,
    y: b.height < 0 ? b.y + b.height : b.y,
    width: Math.abs(b.width),
    height: Math.abs(b.height),
  };
}
