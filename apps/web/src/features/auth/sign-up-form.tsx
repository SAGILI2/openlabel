"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { formText } from "@/lib/utils";
import { authErrorMessage } from "./errors";
import { FormError } from "./form-error";
import { FormField } from "./form-field";
import { GoogleButton, OrDivider } from "./google-button";

export function SignUpForm({
  googleEnabled,
  minPasswordLength,
}: {
  googleEnabled: boolean;
  minPasswordLength: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = formText(form, "password");
    if (password.length < minPasswordLength) {
      setError(`Use at least ${String(minPasswordLength)} characters.`);
      return;
    }
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.signUp.email({
      name: formText(form, "name").trim(),
      email: formText(form, "email").trim(),
      password,
    });
    setPending(false);
    if (failure) {
      setError(
        failure.status === 400 || failure.status === 429
          ? authErrorMessage(failure)
          : "Accounts can't be created right now. Ask an administrator for an invitation.",
      );
      return;
    }
    // Same outcome whether or not the email was already registered.
    router.replace("/sign-in?created=1");
  }

  return (
    <div className="grid gap-5">
      {googleEnabled && (
        <>
          <GoogleButton label="Sign up with Google" />
          <OrDivider />
        </>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <FormField id="name" label="Full name" autoComplete="name" required autoFocus />
        <FormField id="email" label="Work email" type="email" autoComplete="email" required />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={minPasswordLength}
          hint={`At least ${String(minPasswordLength)} characters. A short phrase is easier to remember and harder to guess.`}
        />
        <FormError message={error} />
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-muted-foreground text-[13px]">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-foreground font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
