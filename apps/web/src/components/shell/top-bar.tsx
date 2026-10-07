import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "@/features/orgs";
import { getOrgContext } from "@/server/orgs";
import { LogoMark } from "./logo-mark";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Top bar: organisation switcher, page title, search, theme and account.
 * On phones: logo, organisation and account; search collapses to an icon and the title hides.
 */
export async function TopBar({ title }: { title: string }) {
  const { session, orgs, active } = await getOrgContext();
  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:gap-4 sm:px-6">
      <LogoMark className="size-7 shrink-0 md:hidden" />
      {active && (
        <>
          <OrgSwitcher orgs={orgs.map(({ id, name, role }) => ({ id, name, role }))} activeId={active.id} />
          <span className="text-border hidden text-[18px] select-none sm:inline" aria-hidden>
            /
          </span>
        </>
      )}
      <h1 className="hidden truncate text-[15px] font-semibold tracking-tight sm:block">{title}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <label className="text-muted-foreground bg-card hover:border-input hidden h-9 w-48 items-center gap-2 rounded-md border px-3 text-[13px] transition-colors md:flex lg:w-72">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            type="search"
            placeholder="Search projects, assets, labels"
            className="placeholder:text-muted-foreground text-foreground w-full min-w-0 bg-transparent outline-none"
          />
          <kbd className="font-mono text-[11px]">/</kbd>
        </label>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search">
          <Search className="size-[18px]" />
        </Button>
        <ThemeToggle />
        <UserMenu name={session.user.name} email={session.user.email} />
      </div>
    </header>
  );
}
