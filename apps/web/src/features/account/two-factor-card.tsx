"use client";
import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type SubmitEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authErrorMessage, FormError, FormField } from "@/features/auth";
import { authClient } from "@/lib/auth-client";
import { formText } from "@/lib/utils";

type Step =
  | { kind: "idle" }
  | { kind: "password"; action: "enable" | "disable" | "codes" }
  | { kind: "scan"; qr: string; secret: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

const SLOTS = [0, 1, 2, 3, 4, 5] as const;

function secretFromUri(uri: string): string {
  return new URL(uri).searchParams.get("secret") ?? "";
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <ol className="bg-muted grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border p-4 font-mono text-[13px] tabular-nums">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join("\n")).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <p className="text-muted-foreground text-[12px]">
          Store these somewhere safe. Each code signs you in once if you lose your phone.
        </p>
      </div>
    </div>
  );
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setStep({ kind: "idle" });
    setCode("");
    setError(null);
  }

  async function onPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "password") return;
    const password = formText(new FormData(event.currentTarget), "current-password");
    setPending(true);
    setError(null);
    if (step.action === "enable") {
      const { data, error: failure } = await authClient.twoFactor.enable({ password });
      setPending(false);
      if (failure) {
        setError(authErrorMessage({ ...failure, code: "INVALID_PASSWORD" }));
        return;
      }
      if (!("totpURI" in data)) return;
      const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 176 });
      setStep({ kind: "scan", qr, secret: secretFromUri(data.totpURI), backupCodes: data.backupCodes });
    } else if (step.action === "disable") {
      const { error: failure } = await authClient.twoFactor.disable({ password });
      setPending(false);
      if (failure) {
        setError(authErrorMessage({ ...failure, code: "INVALID_PASSWORD" }));
        return;
      }
      reset();
      router.refresh();
    } else {
      const { data, error: failure } = await authClient.twoFactor.generateBackupCodes({ password });
      setPending(false);
      if (failure) {
        setError(authErrorMessage({ ...failure, code: "INVALID_PASSWORD" }));
        return;
      }
      setStep({ kind: "codes", backupCodes: data.backupCodes });
    }
  }

  async function onVerify(value: string) {
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (failure) {
      setCode("");
      setError(authErrorMessage({ ...failure, code: "INVALID_CODE" }));
      return;
    }
    if (step.kind === "scan") setStep({ kind: "codes", backupCodes: step.backupCodes });
    router.refresh();
  }

  return (
    <section aria-labelledby="tfa-heading" className="bg-card rounded-lg border">
      <div className="flex items-start gap-4 border-b p-5">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md border">
          {enabled ? (
            <ShieldCheck className="size-4" aria-hidden />
          ) : (
            <ShieldOff className="size-4" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="tfa-heading" className="font-semibold">
              Two-factor authentication
            </h2>
            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Ask for a code from an authenticator app (1Password, Google Authenticator, Authy) each time you
            sign in on a new device.
          </p>
        </div>
        {step.kind === "idle" && (
          <div className="flex shrink-0 gap-2">
            {enabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep({ kind: "password", action: "codes" });
                }}
              >
                New recovery codes
              </Button>
            )}
            <Button
              variant={enabled ? "outline" : "default"}
              size="sm"
              onClick={() => {
                setStep({ kind: "password", action: enabled ? "disable" : "enable" });
              }}
            >
              {enabled ? "Turn off" : "Set up"}
            </Button>
          </div>
        )}
      </div>

      {step.kind === "password" && (
        <form onSubmit={(e) => void onPassword(e)} className="grid max-w-sm gap-4 p-5" noValidate>
          <FormField
            id="current-password"
            label="Confirm your password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {step.action === "enable"
                ? "Continue"
                : step.action === "disable"
                  ? "Turn off"
                  : "Generate codes"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <div className="grid gap-6 p-5 sm:grid-cols-[176px_1fr]">
          <img
            src={step.qr}
            alt="QR code for your authenticator app"
            className="size-44 rounded-md border bg-white p-1"
          />
          <div className="grid content-start gap-4">
            <div>
              <p className="font-medium">1. Scan the QR code with your authenticator app</p>
              <p className="text-muted-foreground mt-1 text-[13px]">
                Can&apos;t scan? Enter this key instead:{" "}
                <code className="text-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[12px] break-all">
                  {step.secret}
                </code>
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-otp" className="font-medium">
                2. Enter the 6-digit code it shows
              </Label>
              <InputOTP
                id="setup-otp"
                maxLength={6}
                value={code}
                onChange={setCode}
                onComplete={(v: string) => {
                  void onVerify(v);
                }}
                inputMode="numeric"
                pattern="^[0-9]+$"
                autoFocus
                disabled={pending}
              >
                <InputOTPGroup className="font-mono">
                  {SLOTS.map((i) => (
                    <InputOTPSlot key={i} index={i} className="size-10" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <FormError message={error} />
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {step.kind === "codes" && (
        <div className="grid gap-4 p-5">
          <p className="font-medium">Recovery codes</p>
          <RecoveryCodes codes={step.backupCodes} />
          <div>
            <Button type="button" onClick={reset}>
              Done
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
