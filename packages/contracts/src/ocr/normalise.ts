/**
 * Helpers adapters use to normalise engine output into the canonical contract.
 * Kept pure and side-effect free so they can be unit-tested against each engine's conventions.
 */

/** Converts a confidence that may be 0–1 or 0–100 into 0–1; `undefined`/NaN become `null`. */
export function toUnitConfidence(value: number | null | undefined, scale: 1 | 100): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const v = scale === 100 ? value / 100 : value;
  return Math.min(1, Math.max(0, v));
}

/** Scales a polygon given in 0–1 fractions of the page to pixels. */
export function fractionToPixels(
  poly: readonly (readonly [number, number])[],
  width: number,
  height: number,
): [number, number][] {
  return poly.map(([x, y]) => [x * width, y * height]);
}

/**
 * Maps a point from a page the engine rotated by `degrees` (clockwise, 0/90/180/270)
 * back to the original page of size `width` × `height`.
 */
export function unrotatePoint(
  [x, y]: readonly [number, number],
  degrees: number,
  width: number,
  height: number,
): [number, number] {
  const d = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  switch (d) {
    case 0:
      return [x, y];
    case 90:
      return [y, height - x];
    case 180:
      return [width - x, height - y];
    case 270:
      return [width - y, x];
    default:
      throw new RangeError(`unsupported rotation ${degrees}`);
  }
}
