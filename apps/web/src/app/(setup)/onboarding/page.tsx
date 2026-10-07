import { SplitFrame } from "@/components/shell";
import { AuthHeading } from "@/features/auth";
import { CreateOrgForm } from "@/features/orgs";
import { getOrgContext } from "@/server/orgs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create an organisation" };

export default async function OnboardingPage() {
  const { orgs } = await getOrgContext();
  return (
    <SplitFrame>
      <AuthHeading
        title={orgs.length === 0 ? "Create your organisation" : "New organisation"}
        description={
          orgs.length === 0
            ? "Projects, data and people live in an organisation. You'll be its owner and can invite your team next."
            : "Keep separate teams or clients apart. Data is never shared between organisations."
        }
      />
      <CreateOrgForm />
      <p className="text-muted-foreground mt-6 text-[13px]">
        Joining an existing team? Ask an admin to invite you, then open the link they send.
      </p>
    </SplitFrame>
  );
}
