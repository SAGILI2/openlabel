import { AuthHeading, SignUpForm } from "@/features/auth";
import { getConfig } from "@/server/env";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Label, review and evaluate training data with your team."
      />
      <SignUpForm
        googleEnabled={Boolean(getConfig().GOOGLE_CLIENT_ID)}
        minPasswordLength={getConfig().AUTH_PASSWORD_MIN_LENGTH}
      />
    </>
  );
}
