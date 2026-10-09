import {
  canonicalOcrPageSchema,
  imageAnnotationSchema,
  type ImageAnnotation,
  type ImageRegion,
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
  /** The model's confidence in what it read (`ocrText`); null for boxes a person drew. */
  conf: number | null;
  lineId?: string | undefined;
  /** What the OCR read; undefined for boxes a person drew. */
  ocrText?: string | undefined;
  /** A person confirmed the text without changing it. */
  verified?: boolean | undefined;
}

export type WordState = "drawn" | "edited" | "verified" | "ocr";

/**
 * Where a word's text stands. A correction is any difference from what the OCR read, compared
 * exactly (case and spacing matter): typing the same text back is not an edit.
 */
export function wordState(w: EditableWord): WordState {
  if (w.ocrText === undefined) return "drawn";
  if (w.text !== w.ocrText) return "edited";
  return w.verified ? "verified" : "ocr";
}

/** Still needs a look: the OCR wasn't sure and nobody has edited or confirmed it. */
export function needsCheck(w: EditableWord): boolean {
  return wordState(w) === "ocr" && w.conf !== null && w.conf < LOW_CONFIDENCE;
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

/**
 * Words from a canonical OCR prediction, in reading order (line by line). Pages of a document
 * get page-prefixed ids, since the engine numbers words per page.
 */
export function wordsFromPrediction(result: unknown, page?: number): EditableWord[] {
  const parsed = canonicalOcrPageSchema.safeParse(result);
  if (!parsed.success) return [];
  return parsed.data.lines.flatMap((line) =>
    line.words.map((w) => ({
      id: page ? `p${String(page)}-${w.id}` : w.id,
      text: w.text,
      box: polyToBox(w.poly),
      conf: w.conf,
      ocrText: w.text,
      // Engine lines are often fragments of one printed line; the editor regroups by position.
    })),
  );
}

/** Words from a saved annotation (text regions only); for a document, those on `page`. */
export function wordsFromAnnotation(data: unknown, page?: number): EditableWord[] {
  const parsed = imageAnnotationSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.regions
    .filter((r): r is TextRegion => r.kind === "text" && (page === undefined || (r.page ?? 1) === page))
    .map((r) => ({
      id: r.id,
      text: r.text,
      box: polyToBox(r.poly),
      conf: r.conf ?? null,
      lineId: r.lineId,
      ...legacyText(r),
    }));
}

/**
 * The annotation to save. Degenerate boxes (under 2px either way) are dropped. `page` marks every
 * region as being on that page of a document.
 */
export function annotationFromWords(words: readonly EditableWord[], page?: number): ImageAnnotation {
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
        ...(w.ocrText === undefined ? {} : { ocrText: w.ocrText }),
        ...(w.verified ? { verified: true } : {}),
        ...(page ? { page } : {}),
      })),
  });
}

/**
 * One annotation for a whole document: the page being edited plus the other pages' saved regions.
 * Regions are kept in page order and `pages` records which pages a person has saved; pages not
 * in it are still OCR drafts and are left out of exports.
 */
export function documentAnnotation(
  others: readonly ImageRegion[],
  current: ImageAnnotation,
  page: number,
  checked: readonly number[],
): ImageAnnotation {
  const regions = [...others.filter((r) => (r.page ?? 1) !== page), ...current.regions].sort(
    (a, b) => (a.page ?? 1) - (b.page ?? 1),
  );
  return imageAnnotationSchema.parse({
    tags: current.tags,
    regions,
    pages: [...new Set([...checked, page])].sort((a, b) => a - b),
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

/**
 * Labels saved before the OCR text was kept: an OCR word with confidence was untouched, and one
 * without (other than a drawn `u…` box) was edited or confirmed by a person, so it counts as checked.
 */
function legacyText(r: TextRegion): Pick<EditableWord, "ocrText" | "verified"> {
  if (r.ocrText !== undefined) return { ocrText: r.ocrText, verified: r.verified };
  if (r.id.startsWith("u")) return {};
  return r.conf === undefined ? { ocrText: r.text, verified: true } : { ocrText: r.text };
}

/**
 * A box on a page `width`×`height` after turning the page `deg` degrees counter-clockwise (as
 * Pillow's `rotate(deg, expand=True)` does): used to keep saved boxes on the text when a person
 * turns a page.
 */
export function turnBox(b: Box, deg: number, width: number, height: number): Box {
  const turn = (((deg % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const point = ([x, y]: [number, number]): [number, number] =>
    turn === 90
      ? [y, width - x]
      : turn === 180
        ? [width - x, height - y]
        : turn === 270
          ? [height - y, x]
          : [x, y];
  const corners = [point([b.x, b.y]), point([b.x + b.width, b.y + b.height])];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
