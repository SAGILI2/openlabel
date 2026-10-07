"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** One-line project header: name, task type, progress, and Files / Exports tabs. */
export function ProjectHeader({
  slug,
  name,
  taskTitle,
  total,
  labelled,
  ocrRunning,
  inReview,
}: {
  slug: string;
  name: string;
  taskTitle: string;
  total: number;
  labelled: number;
  ocrRunning: number;
  inReview: number;
}) {
  const pathname = usePathname();
  const base = `/projects/${slug}`;
  const tabs = [
    { href: base, label: "Files", active: pathname === base },
    { href: `${base}/exports`, label: "Exports", active: pathname.startsWith(`${base}/exports`) },
    { href: `${base}/settings`, label: "Settings", active: pathname.startsWith(`${base}/settings`) },
  ];
  const pct = total ? Math.round((labelled / total) * 100) : 0;
  return (
    <div className="border-b px-4 pt-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[18px] font-semibold tracking-tight">{name}</h2>
        <span className="text-muted-foreground text-[13px]">{taskTitle}</span>
        <div className="text-muted-foreground ml-auto flex items-center gap-3 text-[12px] tabular-nums">
          <div className="bg-muted h-1.5 w-28 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-success h-full" style={{ width: `${String(pct)}%` }} />
          </div>
          <span>
            <span className="text-foreground font-medium">{labelled}</span> of {total} approved
          </span>
          {inReview > 0 && <span>· {inReview} in review</span>}
          {ocrRunning > 0 && <span>· {ocrRunning} reading</span>}
        </div>
      </div>
      <nav className="mt-3 flex gap-4" aria-label="Project">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-2 text-[13px] font-medium",
              t.active
                ? "border-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
