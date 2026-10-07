import { AuthHeading, TwoFactorForm } from "@/features/auth";

export const metadata = { title: "Two-factor authentication" };

export default function TwoFactorPage() {
  return (
    <>
      <AuthHeading
        title="Check your authenticator"
        description="Enter the 6-digit code from your authenticator app to finish signing in."
      />
      <TwoFactorForm />
    </>
  );
}
