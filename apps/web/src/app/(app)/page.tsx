import Link from "next/link";
import { PageBody, TopBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { GettingStarted, SystemStatus, WorkbenchPreview, type SetupStep } from "@/features/overview";
import { getConfig } from "@/server/env";
import { checkHealth } from "@/server/health";
import { getOrgContext } from "@/server/orgs";
import { listMembers, resolveOrgScope } from "@openlabel/db";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

const VERSION = process.env.OPENLABEL_VERSION ?? "0.0.0-dev";

export default async function OverviewPage() {
  const [health, { session, active }] = await Promise.all([
    checkHealth(getConfig(), VERSION),
    getOrgContext(),
  ]);
  const memberCount = active
    ? (await listMembers(await resolveOrgScope(getDb().db, session.user.id, active.id))).length
    : 0;
  const steps: SetupStep[] = [
    {
      title: "Start the platform",
      description: "Database and storage are reachable.",
      done: health.status === "ok",
    },
    {
      title: "Create an organisation and invite your team",
      description:
        memberCount > 1
          ? `${String(memberCount)} people in ${active?.name ?? "your organisation"}.`
          : "Invite people and give each a role.",
      done: memberCount > 1,
    },
    {
      title: "Create a project and a label set",
      description: "Choose the data type and define labels with guidelines.",
      done: false,
    },
    {
      title: "Upload data and connect a pre-label model",
      description: "Models draft labels; people correct them.",
      done: false,
    },
    {
      title: "Export a dataset or run an evaluation",
      description: "Send verified data to training, or benchmark any OCR engine.",
      done: false,
    },
  ];

  return (
    <>
      <TopBar title="Overview" />
      <PageBody>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="max-w-[34rem]">
            <h2 className="text-[32px] leading-tight font-semibold tracking-tight text-balance">
              Turn raw documents, audio and text into training data you can trust.
            </h2>
            <p className="text-muted-foreground mt-4 text-[16px] leading-relaxed">
              Models draft the labels. Your team corrects them on the original material. Every change is
              versioned, every dataset is reproducible, and any model can be measured against your own ground
              truth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90" asChild>
                <Link href="/projects">Create a project</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="https://github.com/SAGILI2/openlabel/blob/main/docs/architecture.md">
                  Read the architecture
                </a>
              </Button>
            </div>
          </div>
          <WorkbenchPreview />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <GettingStarted steps={steps} />
          <SystemStatus report={health} />
        </div>
      </PageBody>
    </>
  );
}
