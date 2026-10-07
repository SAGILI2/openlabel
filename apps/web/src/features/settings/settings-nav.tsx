"use client";

import { Building2, KeyRound, ShieldCheck, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    label: "Account",
    items: [{ href: "/settings/security", label: "Security", icon: ShieldCheck, ticket: null }],
  },
  {
    label: "Organisation",
    items: [
      { href: "/settings/members", label: "Members", icon: Users, ticket: null },
      { href: "/settings/general", label: "General", icon: Building2, ticket: "OL-9" },
      { href: "/settings/roles", label: "Roles", icon: UserCog, ticket: "OL-10" },
      { href: "/settings/api-keys", label: "API keys", icon: KeyRound, ticket: "OL-34" },
    ],
  },
] as const;

/**
 * Settings sub-navigation: a grouped column beside the content on desktop, or a horizontally
 * scrolling tab row under the top bar on tablets and phones.
 */
export function SettingsNav({ variant = "column" }: { variant?: "column" | "tabs" }) {
  const pathname = usePathname();
  const column = variant === "column";
  return (
    <nav
      aria-label="Settings"
      className={cn(
        column
          ? "flex flex-col gap-5 px-3 py-5"
          : "scrollbar-none bg-background/95 sticky top-16 z-10 flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 backdrop-blur sm:px-6 lg:hidden",
      )}
    >
      {GROUPS.map((group) => (
        <div key={group.label} className={cn("flex gap-1", column && "flex-col")}>
          {column && <p className="text-muted-foreground px-3 pb-1 text-[12px] font-medium">{group.label}</p>}
          {group.items.map(({ href, label, icon: Icon, ticket }) => {
            const active = pathname === href;
            if (ticket) {
              return (
                <span
                  key={href}
                  className="text-muted-foreground/60 flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px]"
                  title={`Coming with ${ticket}`}
                >
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:bg-muted hover:text-foreground flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
