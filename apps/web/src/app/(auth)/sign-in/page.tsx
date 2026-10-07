import { AuthHeading, SignInForm } from "@/features/auth";
import { getConfig } from "@/server/env";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Pick up where your team left off." />
      <SignInForm
        googleEnabled={Boolean(getConfig().GOOGLE_CLIENT_ID)}
        notice={created ? "Account created. Sign in to continue." : undefined}
      />
    </>
  );
}
