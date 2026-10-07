"use client";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrganizationAction } from "@/server/orgs/actions";
import { roleLabel } from "./roles";
import type { OrgRole } from "@openlabel/db";

export interface SwitcherOrg {
  id: string;
  name: string;
  role: OrgRole;
}

function Monogram({ name }: { name: string }) {
  return (
    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Active organisation and a menu to switch or create one. */
export function OrgSwitcher({ orgs, activeId }: { orgs: SwitcherOrg[]; activeId: string }) {
  const [pending, startTransition] = useTransition();
  const active = orgs.find((o) => o.id === activeId);
  if (!active) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted focus-visible:ring-ring -ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 disabled:opacity-60"
        disabled={pending}
        aria-label={`Organisation: ${active.name}. Switch organisation`}
      >
        <Monogram name={active.name} />
        <span className="max-w-[180px] truncate text-[14px] font-semibold">{active.name}</span>
        <ChevronsUpDown className="text-muted-foreground size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-[12px] font-normal">
          Organisations
        </DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => {
              if (o.id !== activeId) startTransition(() => void switchOrganizationAction(o.id));
            }}
          >
            <Monogram name={o.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{o.name}</span>
              <span className="text-muted-foreground block text-[12px]">{roleLabel(o.role)}</span>
            </span>
            {o.id === activeId && <Check className="size-4" aria-label="Current" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden />
            New organisation
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
