import type { ReactNode } from "react";
import { TopBar } from "@/components/shell";
import { ProjectHeader } from "@/features/browser";
import { loadProject } from "@/server/projects/load";

/** Project frame: app top bar, one-line project header with tabs, then the tab content. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { project, tree, counts, taskTitle } = await loadProject(slug);
  return (
    // Exactly the viewport height under the app chrome, so tabs manage their own scrolling.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TopBar title={project.name} />
      <ProjectHeader
        slug={project.slug}
        name={project.name}
        taskTitle={taskTitle}
        total={tree.totalCount}
        labelled={counts.labelled}
        ocrRunning={counts.ocrRunning}
        inReview={counts.inReview}
      />
      {children}
    </div>
  );
}
