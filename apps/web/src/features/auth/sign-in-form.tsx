"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { formText } from "@/lib/utils";
import { authErrorMessage } from "./errors";
import { FormError } from "./form-error";
import { FormField } from "./form-field";
import { GoogleButton, OrDivider } from "./google-button";

export function SignInForm({
  googleEnabled,
  notice,
}: {
  googleEnabled: boolean;
  notice?: string | undefined;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(true);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { data, error: failure } = await authClient.signIn.email({
      email: formText(form, "email"),
      password: formText(form, "password"),
      rememberMe: remember,
    });
    setPending(false);
    if (failure) {
      setError(authErrorMessage(failure));
      return;
    }
    // Accounts with two-factor are sent to the second step by the client plugin instead.
    if (!("twoFactorRedirect" in data)) {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-5">
      {notice && (
        <p role="status" className="bg-accent text-accent-foreground rounded-md px-3 py-2 text-[13px]">
          {notice}
        </p>
      )}
      {googleEnabled && (
        <>
          <GoogleButton label="Continue with Google" />
          <OrDivider />
        </>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <FormField id="email" label="Email" type="email" autoComplete="email" required autoFocus />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          aside={
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          }
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(v) => {
              setRemember(v === true);
            }}
          />
          <Label htmlFor="remember" className="text-muted-foreground font-normal">
            Keep me signed in for 7 days
          </Label>
        </div>
        <FormError message={error} />
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-muted-foreground text-[13px]">
        New to OpenLabel?{" "}
        <Link href="/sign-up" className="text-foreground font-medium underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
