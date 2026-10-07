"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo-mark";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Narrow icon rail: keeps the labelling canvas as wide as possible. */
export function NavRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="bg-sidebar border-sidebar-border flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <Link href="/" className="text-foreground mb-3 rounded-md p-1" aria-label="OpenLabel home">
        <LogoMark className="size-7" />
      </Link>
      {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => {
        const active = isActive(pathname, href);
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:bg-muted hover:text-foreground relative flex size-10 items-center justify-center rounded-md transition-colors",
                  active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {active && (
                  <span aria-hidden className="bg-brand absolute top-2 bottom-2 -left-2 w-0.5 rounded-full" />
                )}
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {label}
              <kbd className="text-muted-foreground font-mono text-[11px]">g {shortcut}</kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
