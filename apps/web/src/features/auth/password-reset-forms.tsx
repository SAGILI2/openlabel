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

/** Asks for a reset link. Always reports success, so it never reveals whether an account exists. */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = formText(new FormData(event.currentTarget), "email").trim();
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (failure) {
      setError(authErrorMessage(failure));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <p role="status" className="bg-accent text-accent-foreground rounded-md px-3 py-2.5 text-[13px]">
          If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. It works for one
          hour.
        </p>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <FormField id="email" label="Email" type="email" autoComplete="email" required autoFocus />
        <FormError message={error} />
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <BackToSignIn />
    </div>
  );
}

/** Sets a new password from the emailed link's token. */
export function ResetPasswordForm({ token, minLength }: { token: string | null; minLength: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-destructive text-[13px]">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-[13px] font-medium underline-offset-4 hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = formText(form, "password");
    if (password !== formText(form, "confirm")) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    setPending(false);
    if (failure) {
      setError(
        failure.code === "INVALID_TOKEN"
          ? "This reset link is invalid or has expired."
          : authErrorMessage(failure),
      );
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        hint={`At least ${String(minLength)} characters.`}
        required
        autoFocus
      />
      <FormField id="confirm" label="Repeat password" type="password" autoComplete="new-password" required />
      <FormError message={error} />
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

function BackToSignIn() {
  return (
    <p className="text-muted-foreground text-[13px]">
      Remembered it?{" "}
      <Link href="/sign-in" className="text-foreground font-medium underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
