"use client";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { folderChildrenAction } from "@/server/projects/actions";
import { useNavigationPending } from "./navigation-pending";

/** One folder as the tree shows it; children load when it's opened. */
export interface TreeNode {
  id: string;
  name: string;
  path: string;
  /** Files in this folder and below. */
  totalCount: number;
  hasChildren: boolean;
}

/** Which folder is shown: "all" = whole project, "root" = files outside any folder, otherwise a folder id. */
export type FolderSelection = string;

interface Props {
  projectId: string;
  /** Top-level folders (loaded with the page). */
  nodes: TreeNode[];
  /** Folders on the way to the selected one, so the tree opens there. */
  openPath: string[];
  selected: FolderSelection;
  totalCount: number;
  rootFileCount: number;
  hrefFor: (selection: FolderSelection) => string;
  canEdit: boolean;
  onNewFolder: (parent: TreeNode | null) => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  /** Files dropped onto a folder ("root" = project root). */
  onDropFiles: (target: string | null, assetIds: string[]) => void;
  /** Changes when the server data refreshes, so opened folders reload their children. */
  version: string;
}

const DRAG_TYPE = "application/x-openlabel-assets";

export function dragAssets(e: DragEvent, ids: string[]) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "move";
}

function droppedAssets(e: DragEvent): string[] | null {
  const raw = e.dataTransfer.getData(DRAG_TYPE);
  if (!raw) return null;
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

function Row({
  href,
  icon,
  label,
  count,
  active,
  onDrop,
  children,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onDrop?: ((ids: string[]) => void) | undefined;
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const nav = useNavigationPending();
  const opening = nav.pending === href;
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center rounded-md pr-1 text-[13px]",
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        over && "ring-brand ring-2",
      )}
      onDragOver={(e) => {
        if (!onDrop || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const ids = droppedAssets(e);
        if (ids && onDrop) {
          e.preventDefault();
          onDrop(ids);
        }
      }}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2"
        scroll={false}
        onClick={(e) => {
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !active) nav.start(href);
        }}
      >
        {opening ? (
          <Loader2
            className="text-brand size-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-label="Opening"
          />
        ) : (
          icon
        )}
        <span className="truncate">{label}</span>
        <span className="text-muted-foreground ml-auto pl-2 text-[11px] tabular-nums">
          {count.toLocaleString()}
        </span>
      </Link>
      {children}
    </div>
  );
}

const BATCH = 100;

/** Shows a long list 100 at a time; more appear as the end scrolls into view. */
function Batched<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const [count, setCount] = useState(BATCH);
  const end = useRef<HTMLLIElement>(null);
  const more = count < items.length;
  useEffect(() => {
    const el = end.current;
    if (!el || !more) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + BATCH);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [more, count]);
  return (
    <>
      {items.slice(0, count).map(render)}
      {more && (
        <li ref={end} className="text-muted-foreground px-2 py-1.5 text-[11px] tabular-nums">
          Showing {count.toLocaleString()} of {items.length.toLocaleString()} folders…
        </li>
      )}
    </>
  );
}

function Node({ node, depth, props }: { node: TreeNode; depth: number; props: Props }) {
  const isActive = props.selected === node.id;
  const [open, setOpen] = useState(props.openPath.includes(node.id));
  const [children, setChildren] = useState<TreeNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Load this level when the folder is opened (and again after the server data changes).
  useEffect(() => {
    if (!open || !node.hasChildren || loadedFor.current === props.version) return;
    loadedFor.current = props.version;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void folderChildrenAction(props.projectId, node.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.ok) setChildren(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, node.hasChildren, node.id, props.projectId, props.version]);

  const Icon = open && node.hasChildren ? FolderOpen : Folder;
  return (
    <li>
      <div className="flex min-w-0 items-center" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={node.hasChildren ? open : undefined}
          className={cn(
            "text-muted-foreground grid size-5 shrink-0 place-items-center",
            !node.hasChildren && "invisible",
          )}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {loading ? (
            <Loader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-label="Loading folders"
            />
          ) : (
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <Row
            href={props.hrefFor(node.id)}
            icon={<Icon className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />}
            label={node.name}
            count={node.totalCount}
            active={isActive}
            onDrop={
              props.canEdit
                ? (ids) => {
                    props.onDropFiles(node.id, ids);
                  }
                : undefined
            }
          >
            {props.canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Folder actions for ${node.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onNewFolder(node);
                    }}
                  >
                    <Plus /> New sub-folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onRename(node);
                    }}
                  >
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      props.onDelete(node);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 /> Delete…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </Row>
        </div>
      </div>
      {open && node.hasChildren && (
        <ul>
          {children === null && !error && (
            <li
              className="text-muted-foreground flex items-center gap-2 py-1.5 text-[12px]"
              style={{ paddingLeft: (depth + 1) * 14 + 24 }}
            >
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Loading folders…
            </li>
          )}
          {error && (
            <li
              className="text-destructive py-1.5 text-[12px]"
              style={{ paddingLeft: (depth + 1) * 14 + 24 }}
            >
              {error}
            </li>
          )}
          {children && (
            <Batched
              items={children}
              render={(c) => <Node key={c.id} node={c} depth={depth + 1} props={props} />}
            />
          )}
        </ul>
      )}
    </li>
  );
}

/** Project folder tree: all files, unfiled files, then folders that load one level at a time. */
export function FolderTree(props: Props) {
  return (
    // minmax(0,1fr): a long folder name truncates instead of widening the column and pushing
    // the counts out of view.
    <nav aria-label="Folders" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      <Row
        href={props.hrefFor("all")}
        icon={<Layers className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />}
        label="All files"
        count={props.totalCount}
        active={props.selected === "all"}
      />
      <Row
        href={props.hrefFor("root")}
        icon={<Inbox className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />}
        label="Not in a folder"
        count={props.rootFileCount}
        active={props.selected === "root"}
        onDrop={
          props.canEdit
            ? (ids) => {
                props.onDropFiles(null, ids);
              }
            : undefined
        }
      />
      <div className="text-muted-foreground mt-3 mb-1 flex items-center justify-between px-2 text-[12px] font-medium">
        Folders
        {props.canEdit && (
          <button
            type="button"
            className="hover:text-foreground rounded p-0.5"
            aria-label="New folder"
            onClick={() => {
              props.onNewFolder(null);
            }}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {props.nodes.length === 0 ? (
        <p className="text-muted-foreground px-2 text-[12px]">
          No folders yet. Upload a folder or create one.
        </p>
      ) : (
        <ul className="-ml-1 min-w-0">
          <Batched items={props.nodes} render={(n) => <Node key={n.id} node={n} depth={0} props={props} />} />
        </ul>
      )}
    </nav>
  );
}
