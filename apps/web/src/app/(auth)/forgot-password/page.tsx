import { AuthHeading, ForgotPasswordForm } from "@/features/auth";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password" description="We'll email you a link to choose a new one." />
      <ForgotPasswordForm />
    </>
  );
}
