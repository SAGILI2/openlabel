import { canonicalOcrPageSchema, type CanonicalOcrPage } from "@openlabel/contracts";

async function post(
  serviceUrl: string,
  path: string,
  form: FormData,
  params: Record<string, string>,
  timeoutMs: number,
) {
  const url = new URL(path, serviceUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OCR service answered ${String(res.status)}: ${detail.slice(0, 300)}`);
  }
  return res;
}

function fileForm(body: Uint8Array, contentType: string, name: string): FormData {
  const form = new FormData();
  form.append("file", new Blob([body], { type: contentType }), name);
  return form;
}

/** Calls a model service's `POST /predict` and validates the canonical OCR page it returns. */
export async function predictOcr(
  serviceUrl: string,
  image: { body: Uint8Array; contentType: string; name: string },
  assetId: string,
  timeoutMs = 120_000,
  /** Read the page turned this far (degrees counter-clockwise) instead of auto-rotating. */
  rotate?: number,
): Promise<CanonicalOcrPage> {
  const res = await post(
    serviceUrl,
    "/predict",
    fileForm(image.body, image.contentType, image.name),
    { asset_id: assetId, ...(rotate === undefined ? {} : { rotate: String(rotate) }) },
    timeoutMs,
  );
  return canonicalOcrPageSchema.parse(await res.json());
}

/** Number of pages in a PDF. */
export async function pdfInfo(
  serviceUrl: string,
  pdf: Uint8Array,
  timeoutMs = 60_000,
): Promise<{ pages: number }> {
  const res = await post(serviceUrl, "/pdf/info", fileForm(pdf, "application/pdf", "doc.pdf"), {}, timeoutMs);
  const body = (await res.json()) as { pages?: unknown };
  if (typeof body.pages !== "number" || body.pages < 1) throw new Error("PDF has no pages");
  return { pages: body.pages };
}

/** One PDF page (from 1) as a JPEG. */
export async function renderPdfPage(
  serviceUrl: string,
  pdf: Uint8Array,
  page: number,
  timeoutMs = 60_000,
): Promise<Uint8Array> {
  const res = await post(
    serviceUrl,
    "/pdf/render",
    fileForm(pdf, "application/pdf", "doc.pdf"),
    { page: String(page) },
    timeoutMs,
  );
  return new Uint8Array(await res.arrayBuffer());
}

/** Number of words read on the page. */
export function wordCount(page: CanonicalOcrPage): number {
  return page.lines.reduce((n, l) => n + l.words.length, 0);
}

/** Lowest word confidence on the page, or null when no word has one. */
export function minConfidence(page: CanonicalOcrPage): number | null {
  let min: number | null = null;
  for (const line of page.lines) {
    for (const word of line.words) {
      if (word.conf !== null && (min === null || word.conf < min)) min = word.conf;
    }
  }
  return min;
}
