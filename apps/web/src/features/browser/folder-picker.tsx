"use client";
import { Folder, Inbox, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchFoldersAction } from "@/server/projects/actions";

/**
 * Searchable folder list for menus (Move to, jump to folder). Asks the server for up to 50
 * matches as you type, so it works the same with ten folders or ten thousand.
 */
export function FolderPicker({
  projectId,
  onPick,
  includeRoot,
  autoFocus,
}: {
  projectId: string;
  /** null = "Not in a folder". */
  onPick: (folder: { id: string; path: string } | null) => void;
  includeRoot?: boolean;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ id: string; path: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setResults(null);
      void searchFoldersAction(projectId, term).then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setResults(r.data);
          setError(null);
        } else setError(r.error);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [projectId, term]);

  return (
    <div className="grid w-72 gap-1">
      <div className="relative p-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2" />
        <Input
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => {
            setTerm(e.target.value);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
          placeholder="Find a folder"
          aria-label="Find a folder"
          className="h-8 pl-8 text-[13px]"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto pb-1" role="listbox" aria-label="Folders">
        {includeRoot && !term && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onPick(null);
              }}
              className="hover:bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]"
            >
              <Inbox className="text-muted-foreground size-3.5 shrink-0" /> Not in a folder
            </button>
          </li>
        )}
        {results === null && !error && (
          <li className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-[12px]">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Searching…
          </li>
        )}
        {error && <li className="text-destructive px-3 py-2 text-[12px]">{error}</li>}
        {results?.length === 0 && (
          <li className="text-muted-foreground px-3 py-2 text-[12px]">No folder matches “{term}”.</li>
        )}
        {results?.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              title={f.path}
              onClick={() => {
                onPick(f);
              }}
              className="hover:bg-muted flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[13px]"
            >
              <Folder className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate">{f.path}</span>
            </button>
          </li>
        ))}
        {results?.length === 50 && (
          <li className="text-muted-foreground px-3 py-1.5 text-[11px]">
            Showing the first 50. Type to narrow down.
          </li>
        )}
      </ul>
    </div>
  );
}
