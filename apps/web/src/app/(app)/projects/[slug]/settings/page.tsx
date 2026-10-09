import { countNoText, getReviewRules, listEligibleReviewers, orientationStats } from "@openlabel/db";
import { OrientationReport } from "@/features/projects";
import { ReviewRulesForm } from "@/features/review";
import { loadProject } from "@/server/projects/load";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { scope, project, canEdit } = await loadProject(slug);
  const [rules, reviewers, orientation, noText] = await Promise.all([
    getReviewRules(scope, project.id),
    listEligibleReviewers(scope),
    orientationStats(scope, project.id),
    countNoText(scope, project.id),
  ]);
  return (
    <div className="scrollbar-none grid min-h-0 w-full flex-1 content-start gap-6 overflow-y-auto px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight">Review rules</h2>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Pages are labelled, sent for review, then approved or sent back with comments. Only approved pages
          are exported by default.
        </p>
      </div>
      <ReviewRulesForm
        projectId={project.id}
        initial={rules}
        reviewers={reviewers.map((r) => ({ userId: r.userId, name: r.name, email: r.email }))}
        canEdit={canEdit}
      />
      <div className="mt-4">
        <h2 className="text-[18px] font-semibold tracking-tight">Page orientation</h2>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Photos are often sideways or upside down. The OCR asks an orientation model how to turn each page,
          then checks by reading it. Use this to compare orientation models on your own files.
        </p>
      </div>
      <OrientationReport stats={orientation} noText={noText} />
    </div>
  );
}
