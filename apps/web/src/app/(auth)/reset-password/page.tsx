import { AuthHeading, ResetPasswordForm } from "@/features/auth";
import { getConfig } from "@/server/env";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <>
      <AuthHeading title="Choose a new password" description="You'll be signed out everywhere else." />
      <ResetPasswordForm
        token={error || !token ? null : token}
        minLength={getConfig().AUTH_PASSWORD_MIN_LENGTH}
      />
    </>
  );
}
