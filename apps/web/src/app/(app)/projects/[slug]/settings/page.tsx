import { getReviewRules, listEligibleReviewers } from "@openlabel/db";
import { ReviewRulesForm } from "@/features/review";
import { loadProject } from "@/server/projects/load";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { scope, project, canEdit } = await loadProject(slug);
  const [rules, reviewers] = await Promise.all([
    getReviewRules(scope, project.id),
    listEligibleReviewers(scope),
  ]);
  return (
    <div className="grid w-full content-start gap-6 px-4 py-6 sm:px-6">
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
    </div>
  );
}
