"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A line from the selected box on the page to its word in the text, drawn over everything.
 * It follows both ends every frame, so it stays on the selected word through selection changes,
 * box nudges, pans, zooms and scrolling. The path only re-renders when it actually moved.
 */
export function Connector({
  from,
  to,
  enabled,
}: {
  from: () => DOMRect | null;
  to: () => DOMRect | null;
  enabled: boolean;
}) {
  const [path, setPath] = useState<{ d: string; ends: [number, number][] } | null>(null);
  // The latest getters, read by the frame loop without restarting it on every render.
  const ends = useRef({ from, to });
  useEffect(() => {
    ends.current = { from, to };
  });

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const draw = () => {
      const a = ends.current.from();
      const b = ends.current.to();
      if (!a || !b) {
        setPath((p) => (p === null ? p : null));
      } else {
        const x1 = a.right;
        const y1 = a.top + a.height / 2;
        const x2 = b.left - 2;
        const y2 = b.top + b.height / 2;
        const dx = Math.max(60, (x2 - x1) * 0.5);
        const d = `M${String(x1)},${String(y1)} C${String(x1 + dx)},${String(y1)} ${String(x2 - dx)},${String(y2)} ${String(x2)},${String(y2)}`;
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
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled || !path) return null;
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
