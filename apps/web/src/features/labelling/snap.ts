import type { Box } from "./regions";

/** Greyscale pixels of a page, decoded once per page for snapping. */
export interface Ink {
  width: number;
  height: number;
  gray: Uint8Array;
}

/** Decodes an image into greyscale for snapping (browser only). */
export async function loadInk(img: HTMLImageElement): Promise<Ink> {
  await img.decode();
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("no 2d canvas");
  g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0)) | 0;
  }
  return { width, height, gray };
}

/** Otsu threshold: the grey level that best separates ink from paper inside the crop. */
function otsu(hist: number[], n: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * (hist[t] ?? 0);
  let sB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += t * (hist[t] ?? 0);
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/**
 * Shrinks a rough box to the text inside it: finds the ink, keeps the band of rows with the most
 * ink (so bits of the lines above and below don't stretch it), then trims the columns, plus a
 * 2px margin. Returns null when there's no clear text, so the caller keeps the box as drawn.
 */
export function snapToInk(ink: Ink, rough: Box): Box | null {
  const X1 = Math.max(0, Math.floor(rough.x));
  const Y1 = Math.max(0, Math.floor(rough.y));
  const X2 = Math.min(ink.width, Math.ceil(rough.x + rough.width));
  const Y2 = Math.min(ink.height, Math.ceil(rough.y + rough.height));
  const cw = X2 - X1;
  const ch = Y2 - Y1;
  if (cw < 4 || ch < 4) return null;
  const hist = new Array<number>(256).fill(0);
  for (let y = Y1; y < Y2; y++) {
    for (let x = X1; x < X2; x++) {
      const v = ink.gray[y * ink.width + x] ?? 255;
      hist[v] = (hist[v] ?? 0) + 1;
    }
  }
  const thr = otsu(hist, cw * ch);
  // <= : with two clean grey levels the threshold lands exactly on the ink value.
  const dark = (x: number, y: number) => (ink.gray[(Y1 + y) * ink.width + X1 + x] ?? 255) <= thr;

  const rows = new Array<number>(ch).fill(0);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (dark(x, y)) rows[y] = (rows[y] ?? 0) + 1;
  const minRow = Math.max(1, cw * 0.02);
  const bands: { a: number; b: number; ink: number }[] = [];
  let cur: { a: number; b: number; ink: number } | null = null;
  rows.forEach((v, i) => {
    if (v >= minRow) {
      if (!cur) {
        cur = { a: i, b: i, ink: 0 };
        bands.push(cur);
      }
      cur.b = i;
      cur.ink += v;
    } else if (cur && i - cur.b > 2) cur = null;
  });
  if (bands.length === 0) return null;
  const main = bands.reduce((m, b) => (b.ink > m.ink ? b : m));

  const cols = new Array<number>(cw).fill(0);
  for (let y = main.a; y <= main.b; y++)
    for (let x = 0; x < cw; x++) if (dark(x, y)) cols[x] = (cols[x] ?? 0) + 1;
  const minCol = Math.max(1, (main.b - main.a + 1) * 0.08);
  const c0 = cols.findIndex((v) => v >= minCol);
  const c1 = cw - 1 - [...cols].reverse().findIndex((v) => v >= minCol);
  if (c0 < 0 || c1 < c0) return null;
  const x = Math.max(0, X1 + c0 - 2);
  const y = Math.max(0, Y1 + main.a - 2);
  return {
    x,
    y,
    width: Math.min(ink.width, X1 + c1 + 3) - x,
    height: Math.min(ink.height, Y1 + main.b + 3) - y,
  };
}
