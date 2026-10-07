import { FolderKanban } from "lucide-react";
import { PageBody, TopBar } from "@/components/shell";
import { TaskTypeCatalog } from "@/features/tasks";
import { getTaskTypeRegistry } from "@/server/tasks";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  const taskTypes = getTaskTypeRegistry().list();
  return (
    <>
      <TopBar title="Projects" />
      <PageBody className="gap-10">
        <section className="flex items-start gap-4 rounded-lg border border-dashed p-6">
          <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
            <FolderKanban className="size-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">No projects yet</h2>
            <p className="text-muted-foreground mt-1 max-w-[640px] leading-relaxed">
              A project holds the data you label, its label set, the people who work on it and the models that
              pre-label it. Each project uses one of the task types below. Creating projects arrives with{" "}
              <span className="text-foreground font-mono text-[13px]">OL-11</span>.
            </p>
          </div>
        </section>
        <section aria-labelledby="task-types-heading">
          <h2 id="task-types-heading" className="text-[18px] font-semibold tracking-tight">
            What you can label
          </h2>
          <p className="text-muted-foreground mt-1 mb-6">
            {taskTypes.length} task types are installed. Each brings its own editor, model connectors, metrics
            and export formats.
          </p>
          <TaskTypeCatalog taskTypes={taskTypes} />
        </section>
      </PageBody>
    </>
  );
}
