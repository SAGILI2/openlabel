import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

/** Top bar: workspace name, search and theme. Org switcher and user menu arrive with auth (OL-8, OL-9). */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-4 border-b px-6 backdrop-blur">
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
      </div>
    </header>
  );
}
