"use client";
import type { Box } from "./regions";

/**
 * The selected word cut from the page and enlarged, so the text can be checked against the
 * pixels without zooming the canvas. Uses CSS background positioning on the original image.
 */
export function WordZoom({
  imageUrl,
  box,
  imageWidth,
  imageHeight,
}: {
  imageUrl: string;
  box: Box;
  imageWidth: number | null;
  imageHeight: number | null;
}) {
  if (!imageWidth || !imageHeight || box.width < 1 || box.height < 1) return null;
  const pad = Math.max(4, box.height * 0.25);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(imageWidth - x, box.width + pad * 2);
  const h = Math.min(imageHeight - y, box.height + pad * 2);
  // Fit the crop in a 288×96 frame (the frame itself shrinks on narrow screens).
  const scale = Math.min(288 / w, 96 / h, 6);
  return (
    <div className="bg-muted grid h-[112px] min-w-0 place-items-center overflow-hidden rounded-md border">
      <div
        role="img"
        aria-label="Selected word, enlarged"
        className="max-w-full"
        style={{
          width: w * scale,
          height: h * scale,
          backgroundImage: `url(${imageUrl})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${String(imageWidth * scale)}px ${String(imageHeight * scale)}px`,
          backgroundPosition: `-${String(x * scale)}px -${String(y * scale)}px`,
          imageRendering: scale > 2 ? "pixelated" : "auto",
        }}
      />
    </div>
  );
}
