import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { listProjects } from "@openlabel/db";
import { PageBody, TopBar } from "@/components/shell";
import { NewProjectDialog } from "@/features/projects";
import { requireOrgScope } from "@/server/orgs";
import { getTaskTypeRegistry } from "@/server/tasks";

export const metadata = { title: "Projects" };

/** Task types with a working editor in this release (OL-46). */
const READY: ReadonlySet<string> = new Set(["document.ocr"]);

export default async function ProjectsPage() {
  const { scope } = await requireOrgScope();
  const [projects, taskTypes] = [await listProjects(scope), getTaskTypeRegistry().list()];
  const titles = new Map<string, string>(taskTypes.map((t) => [t.id, t.title]));
  const canCreate = ["owner", "admin", "manager"].includes(scope.role);

  return (
    <>
      <TopBar title="Projects" />
      <PageBody className="max-w-none gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">
              Projects <span className="text-muted-foreground font-normal">({projects.length})</span>
            </h2>
            <p className="text-muted-foreground mt-1">Each project holds one kind of data and its labels.</p>
          </div>
          {canCreate && (
            <NewProjectDialog
              taskTypes={taskTypes
                .filter((t) => READY.has(t.id))
                .map((t) => ({ id: t.id, title: t.title, ready: true }))}
            />
          )}
        </div>

        {projects.length === 0 ? (
          <section className="flex items-start gap-4 rounded-lg border border-dashed p-6">
            <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
              <FolderKanban className="size-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="font-semibold">No projects yet</p>
              <p className="text-muted-foreground mt-1 max-w-[640px]">
                {canCreate
                  ? "Create one with New project, then upload page images. OCR drafts the words; you correct them."
                  : "Ask a manager or admin to create a project."}
              </p>
            </div>
          </section>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const pct = p.assetCount ? Math.round((p.labelledCount / p.assetCount) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.slug}`}
                    className="bg-card hover:border-input hover:bg-muted/30 grid h-full gap-3 rounded-lg border p-4 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold">{p.name}</p>
                      <span className="text-muted-foreground shrink-0 text-[12px]">
                        {titles.get(p.taskType) ?? p.taskType}
                      </span>
                    </div>
                    <div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div className="bg-brand h-full" style={{ width: `${String(pct)}%` }} />
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-[12px] tabular-nums">
                        {p.labelledCount} of {p.assetCount} labelled
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
