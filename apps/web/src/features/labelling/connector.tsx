"use client";
import { useEffect, useState } from "react";

/**
 * A line from the selected box on the page to its word in the text, drawn over everything.
 * `tick` changes whenever something moved (pan, zoom, scroll, edit) so it can redraw.
 */
export function Connector({
  tick,
  from,
  to,
  enabled,
}: {
  tick: number;
  from: () => DOMRect | null;
  to: () => DOMRect | null;
  enabled: boolean;
}) {
  const [path, setPath] = useState<{ d: string; ends: [number, number][] } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const a = enabled ? from() : null;
      const b = enabled ? to() : null;
      if (!a || !b) {
        setPath((p) => (p === null ? p : null));
        return;
      }
      const x1 = a.right;
      const y1 = a.top + a.height / 2;
      const x2 = b.left - 2;
      const y2 = b.top + b.height / 2;
      const dx = Math.max(60, (x2 - x1) * 0.5);
      const d = `M${String(x1)},${String(y1)} C${String(x1 + dx)},${String(y1)} ${String(x2 - dx)},${String(y2)} ${String(x2)},${String(y2)}`;
      // Only re-render when the line actually moved, or every render would schedule another.
      setPath((p) =>
        p?.d === d
          ? p
          : {
              d,
              ends: [
                [x1, y1],
                [x2, y2],
              ],
            },
      );
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [tick, enabled, from, to]);

  if (!path) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 z-30 h-screen w-screen overflow-visible" aria-hidden>
      <path
        d={path.d}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 3px color-mix(in oklab, var(--brand) 60%, transparent))" }}
      />
      {path.ends.map(([cx, cy]) => (
        <circle key={`${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r={3.5} fill="var(--brand)" />
      ))}
    </svg>
  );
}
