"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

/** Phone navigation: the rail's destinations as a bottom tab bar, within thumb reach. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="bg-sidebar border-sidebar-border grid shrink-0 grid-cols-6 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
              active && "text-brand",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
