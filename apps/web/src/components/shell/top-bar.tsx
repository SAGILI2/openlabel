import { Search } from "lucide-react";
import { OrgSwitcher } from "@/features/orgs";
import { getOrgContext } from "@/server/orgs";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/** Top bar: organisation switcher, page title, search, theme and account. */
export async function TopBar({ title }: { title: string }) {
  const { session, orgs, active } = await getOrgContext();
  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-4 border-b px-6 backdrop-blur">
      {active && (
        <>
          <OrgSwitcher orgs={orgs.map(({ id, name, role }) => ({ id, name, role }))} activeId={active.id} />
          <span className="text-border text-[18px] select-none" aria-hidden>
            /
          </span>
        </>
      )}
      <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <label className="text-muted-foreground bg-card hover:border-input flex h-9 w-72 items-center gap-2 rounded-md border px-3 text-[13px] transition-colors">
          <Search className="size-4" aria-hidden />
          <input
            type="search"
            placeholder="Search projects, assets, labels"
            className="placeholder:text-muted-foreground text-foreground w-full bg-transparent outline-none"
          />
          <kbd className="font-mono text-[11px]">/</kbd>
        </label>
        <ThemeToggle />
        <UserMenu name={session.user.name} email={session.user.email} />
      </div>
    </header>
  );
}
