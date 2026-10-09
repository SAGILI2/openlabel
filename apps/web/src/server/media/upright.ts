import "server-only";
import sharp from "sharp";

/** Degrees the OCR turned a page counter-clockwise to read it upright (stored on the asset). */
export function rotationOf(mediaMeta: Record<string, unknown>): number {
  const r = typeof mediaMeta.rotation === "number" ? mediaMeta.rotation : 0;
  return (((Math.round(r / 90) * 90) % 360) + 360) % 360;
}

/**
 * The page as people label it: EXIF orientation applied, then turned upright the way the OCR
 * turned it. Boxes are stored against this image. Pillow rotates counter-clockwise and sharp
 * clockwise, hence the minus.
 */
export async function uprightJpeg(body: Uint8Array, rotation: number): Promise<Uint8Array> {
  const straight = await sharp(body).rotate().toBuffer();
  const out = rotation ? sharp(straight).rotate(-rotation) : sharp(straight);
  return new Uint8Array(await out.jpeg({ quality: 90 }).toBuffer());
}

/** Page count of a multi-page document (PDF), or 1. */
export function pageCountOf(mediaMeta: Record<string, unknown>): number {
  return typeof mediaMeta.pageCount === "number" && mediaMeta.pageCount > 0 ? mediaMeta.pageCount : 1;
}

/** Size and turn of one page of a document as the OCR saw it (from 1), or of the image itself. */
export function pageMetaOf(
  mediaMeta: Record<string, unknown>,
  page: number,
): { width: number | null; height: number | null; rotation: number } {
  const pages = Array.isArray(mediaMeta.pages) ? (mediaMeta.pages as Record<string, unknown>[]) : null;
  const m = pages?.[page - 1] ?? (page === 1 ? mediaMeta : {});
  return {
    width: typeof m.width === "number" && m.width > 0 ? m.width : null,
    height: typeof m.height === "number" && m.height > 0 ? m.height : null,
    rotation: rotationOf(m),
  };
}

/** Requested page from a `?page=` value, within 1..count. */
export function pageParam(value: string | null, count: number): number {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= count ? n : 1;
}
