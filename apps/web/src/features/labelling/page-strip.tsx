"use client";
import { Check, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Pages of a multi-page PDF, down the left edge. Each shows whether a person has saved it
 * ("checked") or it's still the OCR draft, and whether the OCR had to turn it. Click to open.
 */
export function PageStrip({
  assetId,
  page,
  pages,
  checked,
  onOpen,
}: {
  assetId: string;
  page: number;
  pages: { words: number; rotation: number }[];
  checked: readonly number[];
  onOpen: (page: number) => void;
}) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [page]);
  const done = new Set(checked);
  return (
    <nav aria-label="Pages" className="bg-card flex w-[92px] shrink-0 flex-col border-r">
      <p className="text-muted-foreground px-3 pt-2.5 pb-1.5 text-[11px] font-semibold tabular-nums">
        {pages.length} pages
      </p>
      <ol ref={ref} className="scroll-fade flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {pages.map((p, i) => {
          const n = i + 1;
          const current = n === page;
          return (
            <li key={n}>
              <button
                type="button"
                aria-current={current ? "page" : undefined}
                aria-label={`Page ${String(n)}${done.has(n) ? ", checked" : ""}`}
                onClick={() => {
                  onOpen(n);
                }}
                className="group block w-full text-left"
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded border bg-white",
                    current ? "ring-brand ring-2" : "opacity-80 group-hover:opacity-100",
                  )}
                >
                  <img
                    src={`/api/assets/${assetId}/thumb?page=${String(n)}`}
                    alt=""
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover object-top"
                  />
                  {done.has(n) && (
                    <span className="bg-success absolute top-1 right-1 grid size-3.5 place-items-center rounded-full text-white">
                      <Check className="size-2.5" />
                    </span>
                  )}
                  {p.rotation !== 0 && (
                    <span
                      title={`The OCR turned this page ${String(p.rotation)}°`}
                      className="bg-card/90 absolute bottom-1 left-1 flex items-center gap-0.5 rounded px-1 text-[9px] tabular-nums"
                    >
                      <RotateCw className="size-2.5" />
                      {p.rotation}°
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground mt-1 flex justify-between text-[10.5px] tabular-nums">
                  <span className={cn(current && "text-foreground font-semibold")}>{n}</span>
                  <span>{p.words === 0 ? "no text" : `${String(p.words)} w`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
