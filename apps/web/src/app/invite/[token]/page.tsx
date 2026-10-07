import Link from "next/link";
import { previewInvitation } from "@openlabel/db";
import { SplitFrame } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { AuthHeading } from "@/features/auth";
import { AcceptInvite, roleLabel } from "@/features/orgs";
import { getSession } from "@/server/auth";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([previewInvitation(getDb().db, token), getSession()]);

  if (!invite) {
    return (
      <SplitFrame>
        <AuthHeading
          title="This invitation can't be used"
          description="It may have expired, been revoked or already been accepted. Ask the person who invited you for a new link."
        />
        <Button asChild variant="outline" className="h-10 w-full">
          <Link href="/">Go to OpenLabel</Link>
        </Button>
      </SplitFrame>
    );
  }

  const description = `You've been invited to join as ${roleLabel(invite.role).toLowerCase()}. The invitation is for ${invite.email}.`;

  if (!session) {
    return (
      <SplitFrame>
        <AuthHeading title={`Join ${invite.orgName}`} description={description} />
        <div className="grid gap-3">
          <Button asChild className="h-10">
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/sign-in">I already have an account</Link>
          </Button>
          <p className="text-muted-foreground text-[13px]">
            Use {invite.email}, then open this link again to accept.
          </p>
        </div>
      </SplitFrame>
    );
  }

  const mismatch = session.user.email.toLowerCase() !== invite.email;
  return (
    <SplitFrame>
      <AuthHeading title={`Join ${invite.orgName}`} description={description} />
      {mismatch ? (
        <p role="alert" className="bg-muted rounded-md px-3 py-2 text-[13px]">
          You&apos;re signed in as {session.user.email}. Sign in as {invite.email} to accept.
        </p>
      ) : (
        <AcceptInvite token={token} orgName={invite.orgName} />
      )}
    </SplitFrame>
  );
}
