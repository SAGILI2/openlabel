import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Content area of an app page: starts right beside the rail, left-aligned with the top bar,
 * capped at a readable width (1100px). Never centred; spare width falls to the right.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid w-full max-w-[1100px] min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 px-4 py-5 sm:gap-8 sm:px-6 sm:py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
