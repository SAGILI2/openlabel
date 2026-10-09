"use client";
import {
  CheckCircle2,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  CircleDashed,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { useDialogs } from "@/components/dialogs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkReviewDialog, SendForReviewDialog, type ReviewerOption } from "@/features/review";
import { cn } from "@/lib/utils";
import {
  createFolderAction,
  deleteFilesAction,
  deleteFolderAction,
  moveAssetsAction,
  renameFolderAction,
  reocrFilesAction,
  reocrNoTextAction,
} from "@/server/projects/actions";
import { FolderPicker } from "./folder-picker";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";
import { dragAssets, FolderTree, type FolderSelection, type TreeNode } from "./folder-tree";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { itemsFromDrop, itemsFromInput, uploadAll, type UploadItem, type UploadProgress } from "./upload";

export interface BrowserFile {
  id: string;
  name: string;
  status: "new" | "prelabelling" | "prelabelled" | "in_progress" | "submitted" | "approved" | "rejected";
  width: number | null;
  height: number | null;
  folderPath: string | null;
}

type Filter = "all" | "mine" | "todo" | "review" | "done" | "ocr" | "notext";
export type Sort = "oldest" | "newest" | "name" | "name-desc";
export const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZES = [50, 100, 200, 500];
const SORT_LABELS: Record<Sort, string> = {
  oldest: "Oldest first",
  newest: "Newest first",
  name: "Name A–Z",
  "name-desc": "Name Z–A",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Waiting for me" },
  { id: "todo", label: "To do" },
  { id: "review", label: "In review" },
  { id: "done", label: "Approved" },
  { id: "ocr", label: "OCR running" },
  { id: "notext", label: "No text" },
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
  /** Top-level folders; deeper levels load in the tree when opened. */
  tree: TreeNode[];
  /** Folders on the way to the selected one, so the tree opens there. */
  openPath: string[];
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
  /** Current filter, page and counts come from the server (filtered and paged in the database). */
  filter: Filter;
  counts: Record<Filter, number>;
  page: number;
  pageSize: number;
  search: string;
  sort: Sort;
  /** Files matching the filter across all pages. */
  total: number;
  view: "list" | "grid";
}

/** Saved labels, not yet in review or approved. */
const READY_FOR_REVIEW = new Set<BrowserFile["status"]>(["in_progress", "rejected"]);

/** Project file browser: folder tree, file list/grid, selection, moving and uploading. */
function FileBrowserInner(props: Props) {
  const rawRouter = useRouter();
  const nav = useNavigationPending();
  // Every in-browser navigation goes through here, so the loader shows straight away.
  const router = {
    ...rawRouter,
    push: (href: string, opts?: { scroll?: boolean }) => {
      nav.start(href);
      rawRouter.push(href, opts);
    },
    replace: (href: string, opts?: { scroll?: boolean }) => {
      nav.start(href);
      rawRouter.replace(href, opts);
    },
  };
  const dialogs = useDialogs();
  const filter = props.filter;
  const [bulkDecision, setBulkDecision] = useState<"approve" | "request_changes" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [dropping, setDropping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // Bumps when the server sends fresh data, so opened folders in the tree reload their children.
  const [treeVersion, setTreeVersion] = useState(0);
  const [seenTree, setSeenTree] = useState(props.tree);
  if (seenTree !== props.tree) {
    setSeenTree(props.tree);
    setTreeVersion((v) => v + 1);
  }
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const base = `/projects/${props.projectSlug}`;
  /** URL for a view of the browser; anything not given keeps its current value. */
  const hrefFor = (
    sel: FolderSelection,
    view = props.view,
    f: Filter = sel === props.selection ? filter : "all",
    more: { page?: number; size?: number; search?: string; sort?: Sort } = {},
  ) => {
    const q = new URLSearchParams();
    if (sel !== "all") q.set("folder", sel);
    if (view !== "list") q.set("view", view);
    if (f !== "all") q.set("filter", f);
    const page = more.page ?? 1;
    const size = more.size ?? props.pageSize;
    const search = more.search ?? (sel === props.selection ? props.search : "");
    const sort = more.sort ?? props.sort;
    if (page > 1) q.set("page", String(page));
    if (size !== DEFAULT_PAGE_SIZE) q.set("size", String(size));
    if (search) q.set("q", search);
    if (sort !== "oldest") q.set("sort", sort);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const firstShown = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const lastShown = Math.min(props.page * props.pageSize, props.total);
  const [searchText, setSearchText] = useState(props.search);
  const [pageInput, setPageInput] = useState(String(props.page));
  const [shownPage, setShownPage] = useState(props.page);
  if (shownPage !== props.page) {
    setShownPage(props.page);
    setPageInput(String(props.page));
  }
  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (searchText === props.search) return;
    const t = setTimeout(() => {
      router.replace(hrefFor(props.selection, props.view, filter, { search: searchText.trim() }), {
        scroll: false,
      });
    }, 350);
    return () => {
      clearTimeout(t);
    };
  });

  const labelHref = (id: string) =>
    `${base}/label/${id}${props.selection === "all" ? "" : `?folder=${props.selection}`}`;

  const visible = props.files;
  const counts = props.counts;
  const nextToLabel = props.files.find((f) => bucket(f.status) === "todo");
  const targetFolderId = props.selection === "all" || props.selection === "root" ? null : props.selection;

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => {
      setMessage(null);
    }, 4000);
  }

  const uploadAbort = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(items: UploadItem[]) {
    if (items.length === 0) return;
    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploading(true);
    // Refresh the list now and then while a big upload runs, not after every file.
    const refresher = setInterval(() => {
      router.refresh();
    }, 8000);
    const result = await uploadAll(props.projectId, targetFolderId, items, setProgress, {
      signal: controller.signal,
    });
    clearInterval(refresher);
    uploadAbort.current = null;
    setUploading(false);
    router.refresh();
    if (controller.signal.aborted) flash(`Upload stopped after ${result.done.toLocaleString()} files.`);
    if (result.failed.length === 0 || controller.signal.aborted) {
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

  /**
   * Reads files again with OCR: the selected ones, or every file whose OCR found no text. Saved
   * labels are kept; each file just gets a fresh OCR draft.
   */
  async function reocr(ids: string[] | "no-text") {
    const n = ids === "no-text" ? counts.notext : ids.length;
    const files = `${n.toLocaleString()} ${n === 1 ? "file" : "files"}`;
    const ok = await dialogs.confirm({
      title: ids === "no-text" ? `Re-run OCR on ${files} with no text?` : `Re-run OCR on ${files}?`,
      description:
        ids === "no-text"
          ? "These came back empty, usually because the page was sideways or upside down. They'll be turned the right way up and read again."
          : "Each file is read again and turned the right way up. Labels people already saved are kept; the new reading shows on files nobody has labelled yet.",
      confirmLabel: `Re-run OCR on ${files}`,
    });
    if (!ok) return;
    setSelected(new Set());
    startTransition(async () => {
      const r =
        ids === "no-text"
          ? await reocrNoTextAction(props.projectId)
          : await reocrFilesAction(props.projectId, ids);
      if (!r.ok) flash(r.error);
      else
        flash(
          `Queued ${r.data.queued.toLocaleString()} for OCR.` +
            (r.data.skipped ? ` ${r.data.skipped.toLocaleString()} already waiting.` : ""),
        );
    });
  }

  const folderNameRules = (v: string) =>
    v.includes("/") || v.includes("\\")
      ? "Folder names can't contain slashes."
      : v.length > 120
        ? "Use 120 characters or fewer."
        : null;

  async function newFolder(parent: TreeNode | null) {
    const parentId = parent?.id ?? null;
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
    const n = node.totalCount;
    const ok = await dialogs.confirm({
      title: `Delete "${node.name}"?`,
      description:
        n === 0
          ? "The folder is empty. This can't be undone."
          : `This deletes the folder, its sub-folders and ${n.toLocaleString()} ${n === 1 ? "file" : "files"} with all their labels, reviews and OCR drafts. Past exports keep their copies. This can't be undone.`,
      confirmLabel:
        n === 0 ? "Delete folder" : `Delete folder and ${n.toLocaleString()} ${n === 1 ? "file" : "files"}`,
      destructive: true,
    });
    if (!ok) return;
    run(
      () => deleteFolderAction(props.projectId, node.id, n > 0),
      n > 0 ? `Deleted "${node.name}" and ${n.toLocaleString()} files.` : `Deleted "${node.name}".`,
    );
    if (props.selection === node.id) router.push(hrefFor("all"));
  }

  async function removeSelected() {
    const ids = [...selected];
    const ok = await dialogs.confirm({
      title: `Delete ${ids.length.toLocaleString()} ${ids.length === 1 ? "file" : "files"}?`,
      description:
        "Their labels, reviews and OCR drafts are deleted too. Past exports keep their copies. This can't be undone.",
      confirmLabel: `Delete ${ids.length.toLocaleString()} ${ids.length === 1 ? "file" : "files"}`,
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteFilesAction(props.projectId, ids), `Deleted ${ids.length.toLocaleString()} files.`);
    setSelected(new Set());
  }

  function move(target: string | null, ids: string[]) {
    run(() => moveAssetsAction(props.projectId, ids, target), `Moved ${String(ids.length)} file(s).`);
    setSelected(new Set());
  }

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
      // Fills the space under the project header; the folder tree and the file list scroll on
      // their own, so the tree stays in place while a long list scrolls.
      className="relative grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]"
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
          projectId={props.projectId}
          nodes={props.tree}
          openPath={props.openPath}
          version={String(treeVersion)}
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

      <section className="flex min-h-0 min-w-0 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 sm:px-6">
          {/* Folder picker for small screens */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 max-w-[200px] text-[13px] lg:hidden">
                <FolderOpen className="size-3.5" aria-hidden />
                <span className="truncate">{props.folderName}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <div className="grid gap-0.5 border-b p-1">
                <Link href={hrefFor("all")} className="hover:bg-muted rounded px-3 py-1.5 text-[13px]">
                  All files ({props.totalCount.toLocaleString()})
                </Link>
              </div>
              <FolderPicker
                projectId={props.projectId}
                includeRoot
                autoFocus
                onPick={(f) => {
                  router.push(hrefFor(f ? f.id : "root"));
                }}
              />
            </PopoverContent>
          </Popover>
          <h2 className="hidden truncate text-[14px] font-semibold lg:block">{props.folderName}</h2>
          <div className="bg-muted flex rounded-md p-0.5" role="tablist" aria-label="Filter">
            {FILTERS.filter(
              (f) =>
                (f.id !== "mine" || props.canReview) &&
                (f.id !== "notext" || counts.notext > 0 || filter === "notext"),
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => {
                  setSelected(new Set());
                  router.push(hrefFor(props.selection, props.view, f.id));
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
          <div className="relative w-full sm:w-56">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
              }}
              placeholder="Search file names"
              aria-label="Search file names"
              className="h-8 pl-8 text-[13px]"
            />
          </div>
          <Select
            value={props.sort}
            onValueChange={(v) => {
              router.push(hrefFor(props.selection, props.view, filter, { sort: v as Sort }), {
                scroll: false,
              });
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-[140px] text-[13px]" aria-label="Sort">
              <ArrowUpDown className="size-3.5 opacity-70" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {props.canEdit && (selected.size > 0 || filter === "notext") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void reocr(selected.size > 0 ? [...selected] : "no-text");
                }}
              >
                <RefreshCw aria-hidden />
                {selected.size > 0
                  ? `Re-run OCR on ${String(selected.size)}`
                  : `Re-run OCR on all ${counts.notext.toLocaleString()}`}
              </Button>
            )}
            {selected.size > 0 && props.canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  void removeSelected();
                }}
              >
                <Trash2 aria-hidden /> Delete {selected.size}
              </Button>
            )}
            {selected.size > 0 && props.canEdit && (
              <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <FolderInput /> Move {selected.size}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <p className="text-muted-foreground px-3 pt-2 text-[12px]">Move to</p>
                  <FolderPicker
                    projectId={props.projectId}
                    includeRoot
                    autoFocus
                    onPick={(f) => {
                      setMoveOpen(false);
                      move(f ? f.id : null, [...selected]);
                    }}
                  />
                </PopoverContent>
              </Popover>
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
                    void newFolder(
                      targetFolderId
                        ? {
                            id: targetFolderId,
                            name: props.folderName,
                            path: props.folderName,
                            totalCount: 0,
                            hasChildren: true,
                          }
                        : null,
                    );
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
            accept="image/*,application/pdf"
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
                  {progress.done.toLocaleString()} of {progress.total.toLocaleString()} uploaded
                </span>
                {progress.done < progress.total && uploading && (
                  <button
                    type="button"
                    onClick={() => uploadAbort.current?.abort()}
                    className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  >
                    Stop
                  </button>
                )}
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
        <div
          className={cn(
            "scrollbar-none relative min-h-0 flex-1 overflow-y-auto transition-opacity",
            nav.pending && "pointer-events-none opacity-50",
          )}
          aria-busy={nav.pending ? true : undefined}
        >
          {nav.pending && (
            <div
              role="status"
              className="bg-card text-muted-foreground sticky top-0 z-10 flex items-center gap-2 border-b px-6 py-2 text-[12px]"
            >
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Loading files…
            </div>
          )}
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
                <p className="text-[13px]">Drop images, PDFs or a folder anywhere here, or use Upload.</p>
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

        {props.total > 0 && (
          <nav
            aria-label="Pages"
            className="bg-card flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2 text-[12px] sm:px-6"
          >
            <span className="text-muted-foreground tabular-nums">
              {firstShown.toLocaleString()}–{lastShown.toLocaleString()} of {props.total.toLocaleString()}
            </span>
            <label className="text-muted-foreground flex items-center gap-1.5">
              Rows
              <Select
                value={String(props.pageSize)}
                onValueChange={(v) => {
                  router.push(hrefFor(props.selection, props.view, filter, { size: Number(v) }), {
                    scroll: false,
                  });
                }}
              >
                <SelectTrigger size="sm" className="h-7 w-[72px] text-[12px]" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="ml-auto flex items-center gap-1">
              {(
                [
                  [1, "First page", ChevronsLeft, props.page <= 1],
                  [props.page - 1, "Previous page", ChevronLeft, props.page <= 1],
                ] as const
              ).map(([p, label, Icon, off]) => (
                <Link
                  key={label}
                  href={hrefFor(props.selection, props.view, filter, { page: p })}
                  scroll={false}
                  aria-label={label}
                  aria-disabled={off}
                  className={cn(
                    "hover:bg-muted rounded-md border p-1.5",
                    off && "pointer-events-none opacity-40",
                  )}
                >
                  <Icon className="size-3.5" />
                </Link>
              ))}
              <form
                className="text-muted-foreground flex items-center gap-1.5 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Math.min(Math.max(Math.floor(Number(pageInput)) || 1, 1), pages);
                  router.push(hrefFor(props.selection, props.view, filter, { page: n }), { scroll: false });
                }}
              >
                Page
                <Input
                  value={pageInput}
                  onChange={(e) => {
                    setPageInput(e.target.value.replace(/[^0-9]/g, ""));
                  }}
                  inputMode="numeric"
                  aria-label="Page number"
                  className="h-7 w-14 px-2 text-center text-[12px] tabular-nums"
                />
                of {pages.toLocaleString()}
              </form>
              {(
                [
                  [props.page + 1, "Next page", ChevronRight, props.page >= pages],
                  [pages, "Last page", ChevronsRight, props.page >= pages],
                ] as const
              ).map(([p, label, Icon, off]) => (
                <Link
                  key={label}
                  href={hrefFor(props.selection, props.view, filter, { page: p })}
                  scroll={false}
                  aria-label={label}
                  aria-disabled={off}
                  className={cn(
                    "hover:bg-muted rounded-md border p-1.5",
                    off && "pointer-events-none opacity-40",
                  )}
                >
                  <Icon className="size-3.5" />
                </Link>
              ))}
            </div>
          </nav>
        )}
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

/** Project file browser; shows a loader while a folder, page or filter is opening. */
export function FileBrowser(props: Props) {
  return (
    <Suspense>
      <NavigationPendingProvider>
        <FileBrowserInner {...props} />
      </NavigationPendingProvider>
    </Suspense>
  );
}
