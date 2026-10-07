import { canonicalOcrPageSchema, type CanonicalOcrPage } from "@openlabel/contracts";

/** Calls a model service's `POST /predict` and validates the canonical OCR page it returns. */
export async function predictOcr(
  serviceUrl: string,
  image: { body: Uint8Array; contentType: string; name: string },
  assetId: string,
  timeoutMs = 120_000,
): Promise<CanonicalOcrPage> {
  const form = new FormData();
  form.append("file", new Blob([image.body], { type: image.contentType }), image.name);
  const url = new URL("/predict", serviceUrl);
  url.searchParams.set("asset_id", assetId);
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OCR service answered ${String(res.status)}: ${detail.slice(0, 300)}`);
  }
  return canonicalOcrPageSchema.parse(await res.json());
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
