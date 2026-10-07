"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { formText } from "@/lib/utils";
import { authErrorMessage } from "./errors";
import { FormError } from "./form-error";
import { FormField } from "./form-field";

const SLOTS = [0, 1, 2, 3, 4, 5] as const;

/** Second sign-in step: a 6-digit authenticator code, or a one-time recovery code. */
export function TwoFactorForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify(value: string) {
    setPending(true);
    setError(null);
    const { error: failure } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
        : await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice: trust });
    setPending(false);
    if (failure) {
      setError(authErrorMessage({ ...failure, code: failure.code ?? "INVALID_CODE" }));
      setCode("");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = mode === "totp" ? code : formText(new FormData(event.currentTarget), "recovery");
    void verify(value);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {mode === "totp" ? (
        <div className="grid gap-2">
          <Label htmlFor="otp">Authentication code</Label>
          <InputOTP
            id="otp"
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={(v: string) => {
              void verify(v);
            }}
            autoFocus
            inputMode="numeric"
            pattern="^[0-9]+$"
          >
            <InputOTPGroup className="font-mono">
              {SLOTS.map((i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-[16px]" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      ) : (
        <FormField
          id="recovery"
          label="Recovery code"
          autoComplete="one-time-code"
          className="font-mono"
          hint="Each recovery code works once."
          autoFocus
        />
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id="trust"
          checked={trust}
          onCheckedChange={(v) => {
            setTrust(v === true);
          }}
        />
        <Label htmlFor="trust" className="text-muted-foreground font-normal">
          Don&apos;t ask again on this device for 30 days
        </Label>
      </div>
      <FormError message={error} />
      <Button type="submit" className="h-10" disabled={pending || (mode === "totp" && code.length < 6)}>
        {pending ? "Verifying…" : "Verify"}
      </Button>
      <div className="text-muted-foreground flex justify-between text-[13px]">
        <button
          type="button"
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "totp" ? "recovery" : "totp");
            setError(null);
            setCode("");
          }}
        >
          {mode === "totp" ? "Use a recovery code" : "Use authenticator app"}
        </button>
        <Link href="/sign-in" className="hover:text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
