"use client";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  Eye,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Play,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/dialogs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkReviewDialog, SendForReviewDialog, type ReviewerOption } from "@/features/review";
import { cn } from "@/lib/utils";
import {
  createFolderAction,
  deleteFolderAction,
  moveAssetsAction,
  renameFolderAction,
} from "@/server/projects/actions";
import { dragAssets, FolderTree, type FolderSelection, type TreeNode } from "./folder-tree";
import { itemsFromDrop, itemsFromInput, uploadAll, type UploadItem, type UploadProgress } from "./upload";

export interface BrowserFile {
  id: string;
  name: string;
  status: "new" | "prelabelling" | "prelabelled" | "in_progress" | "submitted" | "approved" | "rejected";
  width: number | null;
  height: number | null;
  folderPath: string | null;
}

type Filter = "all" | "mine" | "todo" | "review" | "done" | "ocr";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Waiting for me" },
  { id: "todo", label: "To do" },
  { id: "review", label: "In review" },
  { id: "done", label: "Approved" },
  { id: "ocr", label: "OCR running" },
];

function bucket(status: BrowserFile["status"]): Exclude<Filter, "all" | "mine"> {
  if (status === "approved") return "done";
  if (status === "submitted") return "review";
  if (status === "new" || status === "prelabelling") return "ocr";
  return "todo";
}

function StatusMark({ status }: { status: BrowserFile["status"] }) {
  const b = bucket(status);
  if (b === "done")
    return (
      <span className="text-success inline-flex items-center gap-1.5 text-[12px]">
        <CheckCircle2 className="size-3.5" /> Approved
      </span>
    );
  if (b === "review")
    return (
      <span className="text-brand inline-flex items-center gap-1.5 text-[12px]">
        <Eye className="size-3.5" /> In review
      </span>
    );
  if (status === "rejected")
    return (
      <span className="text-destructive inline-flex items-center gap-1.5 text-[12px]">
        <XCircle className="size-3.5" /> Changes requested
      </span>
    );
  if (b === "ocr")
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[12px]">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Reading
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#9a6b00] dark:text-[#E8A400]">
      <Circle className="size-3.5" /> To do
    </span>
  );
}

interface Props {
  projectId: string;
  projectSlug: string;
  selection: FolderSelection;
  folderName: string;
  tree: TreeNode[];
  totalCount: number;
  rootFileCount: number;
  files: BrowserFile[];
  canEdit: boolean;
  /** Everyone except viewers can send pages for review. */
  canSubmit: boolean;
  reviewers: ReviewerOption[];
  defaultReviewerIds: string[];
  /** Reviewer roles and up can approve or request changes. */
  canReview: boolean;
  /** Pages in this project waiting for the signed-in user's review. */
  myQueueIds: string[];
  initialFilter: "all" | "mine" | "review";
  view: "list" | "grid";
}

/** Saved labels, not yet in review or approved. */
const READY_FOR_REVIEW = new Set<BrowserFile["status"]>(["in_progress", "rejected"]);

/** Project file browser: folder tree, file list/grid, selection, moving and uploading. */
export function FileBrowser(props: Props) {
  const router = useRouter();
  const dialogs = useDialogs();
  const [filter, setFilter] = useState<Filter>(props.initialFilter);
  const [bulkDecision, setBulkDecision] = useState<"approve" | "request_changes" | null>(null);
  const mine = useMemo(() => new Set(props.myQueueIds), [props.myQueueIds]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dropping, setDropping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const base = `/projects/${props.projectSlug}`;
  const hrefFor = (sel: FolderSelection, view = props.view) => {
    const q = new URLSearchParams();
    if (sel !== "all") q.set("folder", sel);
    if (view !== "list") q.set("view", view);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const labelHref = (id: string) =>
    `${base}/label/${id}${props.selection === "all" ? "" : `?folder=${props.selection}`}`;

  const visible = useMemo(
    () =>
      props.files.filter((f) =>
        filter === "all" ? true : filter === "mine" ? mine.has(f.id) : bucket(f.status) === filter,
      ),
    [props.files, filter, mine],
  );
  const counts = useMemo(() => {
    const c = { all: props.files.length, mine: 0, todo: 0, review: 0, done: 0, ocr: 0 };
    for (const f of props.files) {
      c[bucket(f.status)] += 1;
      if (mine.has(f.id)) c.mine += 1;
    }
    return c;
  }, [props.files, mine]);
  const nextToLabel = props.files.find((f) => bucket(f.status) === "todo");
  const targetFolderId = props.selection === "all" || props.selection === "root" ? null : props.selection;

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => {
      setMessage(null);
    }, 4000);
  }

  async function upload(items: UploadItem[]) {
    if (items.length === 0) return;
    const result = await uploadAll(props.projectId, targetFolderId, items, setProgress);
    router.refresh();
    if (result.failed.length === 0) {
      setTimeout(() => {
        setProgress(null);
      }, 2500);
    }
  }

  function onDropZone(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDropping(false);
    if (!props.canEdit) return;
    void itemsFromDrop(e.dataTransfer).then(upload);
  }

  function run<T>(action: () => Promise<{ ok: boolean; error?: string } & T>, done?: string) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) flash(r.error ?? "That didn't work.");
      else if (done) flash(done);
    });
  }

  const folderNameRules = (v: string) =>
    v.includes("/") || v.includes("\\")
      ? "Folder names can't contain slashes."
      : v.length > 120
        ? "Use 120 characters or fewer."
        : null;

  async function newFolder(parentId: string | null) {
    const parent = parentId ? allFolders.find((f) => f.id === parentId) : undefined;
    const name = await dialogs.prompt({
      title: "New folder",
      description: parent ? `Inside ${parent.path}` : "At the top of this project",
      label: "Folder name",
      placeholder: "e.g. 2026-07",
      confirmLabel: "Create folder",
      validate: folderNameRules,
    });
    if (name) run(() => createFolderAction(props.projectId, parentId, name), `Created "${name}".`);
  }

  async function renameFolder(node: TreeNode) {
    const name = await dialogs.prompt({
      title: "Rename folder",
      description: node.path,
      label: "Folder name",
      defaultValue: node.name,
      confirmLabel: "Rename",
      validate: folderNameRules,
    });
    if (name && name !== node.name) run(() => renameFolderAction(props.projectId, node.id, name));
  }

  async function removeFolder(node: TreeNode) {
    const ok = await dialogs.confirm({
      title: `Delete "${node.name}"?`,
      description: "The folder is empty. This can't be undone.",
      confirmLabel: "Delete folder",
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteFolderAction(props.projectId, node.id));
    if (props.selection === node.id) router.push(hrefFor("all"));
  }

  function move(target: string | null, ids: string[]) {
    run(() => moveAssetsAction(props.projectId, ids, target), `Moved ${String(ids.length)} file(s).`);
    setSelected(new Set());
  }

  const allFolders = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (ns: TreeNode[]) => {
      for (const n of ns) {
        out.push(n);
        walk(n.children);
      }
    };
    walk(props.tree);
    return out;
  }, [props.tree]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allChecked = visible.length > 0 && visible.every((f) => selected.has(f.id));

  // With a selection, send those pages; otherwise every ready page in this folder view.
  const sendIds =
    selected.size > 0
      ? [...selected]
      : props.files.filter((f) => READY_FOR_REVIEW.has(f.status)).map((f) => f.id);
  const reviewIds = (selected.size > 0 ? props.files.filter((f) => selected.has(f.id)) : visible)
    .filter((f) => f.status === "submitted")
    .map((f) => f.id);
  const reviewScope = selected.size > 0 || filter === "mine" || filter === "review";
  const sendLabel =
    selected.size > 0
      ? `${String(selected.size)} selected ${selected.size === 1 ? "page" : "pages"}`
      : `${String(sendIds.length)} ${sendIds.length === 1 ? "page" : "pages"} with saved labels in ${props.folderName}`;

  return (
    <div
      className="relative grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)]"
      onDragOver={(e) => {
        if (props.canEdit && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={onDropZone}
    >
      {/* Folder tree (desktop) */}
      <aside className="bg-sidebar border-sidebar-border scrollbar-none hidden overflow-y-auto border-r p-3 lg:block">
        <FolderTree
          nodes={props.tree}
          selected={props.selection}
          totalCount={props.totalCount}
          rootFileCount={props.rootFileCount}
          hrefFor={(s) => hrefFor(s)}
          canEdit={props.canEdit}
          onNewFolder={(parentId) => {
            void newFolder(parentId);
          }}
          onRename={(node) => {
            void renameFolder(node);
          }}
          onDelete={(node) => {
            void removeFolder(node);
          }}
          onDropFiles={(target, ids) => {
            move(target, ids);
          }}
        />
      </aside>

      <section className="flex min-w-0 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 sm:px-6">
          {/* Folder picker for small screens */}
          <Select
            value={props.selection}
            onValueChange={(v) => {
              router.push(hrefFor(v));
            }}
          >
            <SelectTrigger size="sm" className="h-8 max-w-[200px] text-[13px] lg:hidden" aria-label="Folder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All files ({props.totalCount})</SelectItem>
              <SelectItem value="root">Not in a folder ({props.rootFileCount})</SelectItem>
              {allFolders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.path} ({f.totalCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <h2 className="hidden truncate text-[14px] font-semibold lg:block">{props.folderName}</h2>
          <div className="bg-muted flex rounded-md p-0.5" role="tablist" aria-label="Filter">
            {FILTERS.filter((f) => f.id !== "mine" || props.canReview).map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                }}
                className={cn(
                  "rounded px-2.5 py-1 text-[12px] font-medium",
                  filter === f.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label} <span className="text-muted-foreground tabular-nums">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {props.canReview && reviewScope && reviewIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <CheckCircle2 aria-hidden /> Review {reviewIds.length}
                    <ChevronDown className="opacity-70" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onSelect={() => {
                      setBulkDecision("approve");
                    }}
                  >
                    <CheckCircle2 className="text-success" aria-hidden /> Approve {reviewIds.length}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setBulkDecision("request_changes");
                    }}
                  >
                    <XCircle className="text-destructive" aria-hidden /> Request changes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {props.canSubmit && sendIds.length > 0 && !(filter === "mine" || filter === "review") && (
              <Button
                size="sm"
                onClick={() => {
                  setSending(true);
                }}
              >
                <Send aria-hidden />
                {selected.size > 0 ? `Send ${String(selected.size)} for review` : "Send for review"}
              </Button>
            )}
            {selected.size > 0 && props.canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FolderInput /> Move {selected.size}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-muted-foreground text-[12px] font-normal">
                    Move to
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      move(null, [...selected]);
                    }}
                  >
                    Not in a folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {allFolders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onSelect={() => {
                        move(f.id, [...selected]);
                      }}
                    >
                      <span className="truncate">{f.path}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="bg-muted flex rounded-md p-0.5">
              <Link
                href={hrefFor(props.selection, "list")}
                scroll={false}
                aria-label="List view"
                className={cn(
                  "rounded p-1.5",
                  props.view === "list" ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                <List className="size-4" />
              </Link>
              <Link
                href={hrefFor(props.selection, "grid")}
                scroll={false}
                aria-label="Grid view"
                className={cn(
                  "rounded p-1.5",
                  props.view === "grid" ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
              </Link>
            </div>
            {props.canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden sm:inline-flex"
                  onClick={() => {
                    void newFolder(targetFolderId);
                  }}
                >
                  <FolderPlus /> Folder
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm">
                      <Upload /> Upload
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => fileInput.current?.click()}>Files…</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
                      Folder (keeps sub-folders)…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {nextToLabel && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={labelHref(nextToLabel.id)}>
                  <Play /> Label
                </Link>
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void upload(itemsFromInput(e.target.files));
              e.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            {...{ webkitdirectory: "" }}
            onChange={(e) => {
              void upload(itemsFromInput(e.target.files));
              e.target.value = "";
            }}
          />
        </div>

        {(progress ?? message) && (
          <div className="border-b px-4 py-2 text-[12px] sm:px-6" role="status">
            {progress && (
              <div className="flex items-center gap-3">
                <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                  <div
                    className="bg-brand h-full transition-[width]"
                    style={{
                      width: `${String(progress.total ? (progress.done / progress.total) * 100 : 100)}%`,
                    }}
                  />
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {progress.done} of {progress.total} uploaded
                </span>
                {progress.failed.map((f) => (
                  <span key={f.name} className="text-destructive">
                    {f.name}: {f.reason}
                  </span>
                ))}
              </div>
            )}
            {message && <p>{message}</p>}
          </div>
        )}

        {/* Files */}
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="text-muted-foreground grid place-items-center gap-2 px-6 py-20 text-center">
              <CircleDashed className="size-6" strokeWidth={1.5} />
              <p className="text-foreground font-medium">
                {props.files.length === 0
                  ? "This folder is empty"
                  : filter === "mine"
                    ? "Nothing waiting for your review"
                    : "Nothing matches this filter"}
              </p>
              {props.files.length === 0 && props.canEdit && (
                <p className="text-[13px]">Drop images or a folder anywhere here, or use Upload.</p>
              )}
            </div>
          ) : props.view === "grid" ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 p-4 sm:p-6">
              {visible.map((f) => (
                <li key={f.id} className="group relative">
                  <Link
                    href={labelHref(f.id)}
                    draggable={props.canEdit}
                    onDragStart={(e) => {
                      dragAssets(e, selected.has(f.id) ? [...selected] : [f.id]);
                    }}
                    className={cn(
                      "bg-card block overflow-hidden rounded-lg border transition-colors hover:border-input",
                      selected.has(f.id) && "ring-brand ring-2",
                    )}
                  >
                    <div className="bg-muted aspect-[3/4] overflow-hidden">
                      <img
                        src={`/api/assets/${f.id}/thumb`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                    <div className="grid gap-1 p-2.5">
                      <p className="truncate font-mono text-[12px]">{f.name}</p>
                      <StatusMark status={f.status} />
                    </div>
                  </Link>
                  {props.canEdit && (
                    <Checkbox
                      checked={selected.has(f.id)}
                      onCheckedChange={() => {
                        toggle(f.id);
                      }}
                      aria-label={`Select ${f.name}`}
                      className={cn(
                        "bg-card absolute top-2 left-2 opacity-0 group-hover:opacity-100",
                        selected.size > 0 && "opacity-100",
                      )}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div role="table" className="text-[13px]">
              <div
                role="row"
                className="text-muted-foreground bg-background sticky top-0 z-[1] grid h-9 grid-cols-[32px_minmax(0,1fr)_110px] items-center gap-3 border-b px-4 text-[12px] font-medium sm:px-6 md:grid-cols-[32px_minmax(0,1fr)_minmax(0,0.6fr)_110px_110px]"
              >
                <span role="columnheader">
                  {props.canEdit && (
                    <Checkbox
                      checked={allChecked}
                      aria-label="Select all"
                      onCheckedChange={() => {
                        setSelected(allChecked ? new Set() : new Set(visible.map((f) => f.id)));
                      }}
                    />
                  )}
                </span>
                <span role="columnheader">Name</span>
                <span role="columnheader" className="hidden md:block">
                  Folder
                </span>
                <span role="columnheader" className="hidden md:block">
                  Size
                </span>
                <span role="columnheader">Status</span>
              </div>
              {visible.map((f) => (
                <div
                  key={f.id}
                  role="row"
                  draggable={props.canEdit}
                  onDragStart={(e) => {
                    dragAssets(e, selected.has(f.id) ? [...selected] : [f.id]);
                  }}
                  className={cn(
                    "hover:bg-muted/50 grid h-11 grid-cols-[32px_minmax(0,1fr)_110px] items-center gap-3 border-b px-4 sm:px-6 md:grid-cols-[32px_minmax(0,1fr)_minmax(0,0.6fr)_110px_110px]",
                    selected.has(f.id) && "bg-accent/50",
                  )}
                >
                  <span role="cell">
                    {props.canEdit && (
                      <Checkbox
                        checked={selected.has(f.id)}
                        aria-label={`Select ${f.name}`}
                        onCheckedChange={() => {
                          toggle(f.id);
                        }}
                      />
                    )}
                  </span>
                  <Link
                    role="cell"
                    href={labelHref(f.id)}
                    className="truncate font-mono text-[12.5px] hover:underline"
                  >
                    {f.name}
                  </Link>
                  <span role="cell" className="text-muted-foreground hidden truncate md:block">
                    {f.folderPath ?? "—"}
                  </span>
                  <span role="cell" className="text-muted-foreground hidden tabular-nums md:block">
                    {f.width && f.height ? `${String(f.width)}×${String(f.height)}` : "—"}
                  </span>
                  <span role="cell">
                    <StatusMark status={f.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <BulkReviewDialog
        decision={bulkDecision}
        onClose={() => {
          setBulkDecision(null);
        }}
        projectId={props.projectId}
        assetIds={reviewIds}
        onDone={(text) => {
          setSelected(new Set());
          flash(text);
        }}
      />

      <SendForReviewDialog
        open={sending}
        onOpenChange={setSending}
        projectId={props.projectId}
        assetIds={sendIds}
        scopeLabel={sendLabel}
        reviewers={props.reviewers}
        defaultReviewerIds={props.defaultReviewerIds}
        onDone={(text) => {
          setSelected(new Set());
          flash(text);
        }}
      />

      {dropping && (
        <div className="bg-brand/10 border-brand pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed">
          <p className="bg-card rounded-md px-4 py-2 font-medium shadow">
            Drop to upload to {props.folderName}
          </p>
        </div>
      )}
    </div>
  );
}
